import os
import json
import re
import pickle
# pyrefly: ignore [missing-import]
from langchain_community.vectorstores import FAISS
# pyrefly: ignore [missing-import]
from langchain_community.retrievers import BM25Retriever
# pyrefly: ignore [missing-import]
from langchain_classic.retrievers import EnsembleRetriever
# pyrefly: ignore [missing-import]
from langchain_ollama import OllamaEmbeddings, ChatOllama
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.documents import Document

from config import settings

def strip_html_tags(text):
    clean = re.compile('<.*?>')
    return re.sub(clean, '', text)

def get_embeddings():
    return OllamaEmbeddings(model=settings.EMBEDDING_MODEL)

_cross_encoder = None
def get_cross_encoder():
    global _cross_encoder
    if _cross_encoder is None:
        # pyrefly: ignore [missing-import]
        from sentence_transformers import CrossEncoder
        _cross_encoder = CrossEncoder(settings.RERANKER_MODEL)
    return _cross_encoder

def build_index(uid: str):
    """Reads data.json for a document, extracts text chunks, embeds them, and saves a local FAISS index + BM25 index."""
    doc_dir = os.path.join("data", uid)
    data_path = os.path.join(doc_dir, "data.json")
    index_path = os.path.join(doc_dir, "faiss_index")
    bm25_path = os.path.join(doc_dir, "bm25_index.pkl")
    
    if os.path.exists(index_path) and os.path.exists(bm25_path):
        return True # Already built
        
    if not os.path.exists(data_path):
        raise FileNotFoundError(f"Document data not found at {data_path}")
        
    with open(data_path, "r", encoding="utf-8") as f:
        pages_data = json.load(f)
    # pyrefly: ignore [missing-import]
    from langchain_text_splitters import RecursiveCharacterTextSplitter
    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1500, chunk_overlap=100)
    
    docs = []
    for page in pages_data:
        page_num = page.get("page_num", 1)
        page_markdown = page.get("markdown", "")
        
        # Fallback for older documents that didn't save markdown
        if not page_markdown:
            blocks = page.get("results", {}).get("text_lines") or page.get("results", {}).get("blocks", [])
            lines = []
            for block in blocks:
                uuid_str = block.get("uuid", "")
                text = block.get("text", block.get("text_content", ""))
                if not text:
                    text = strip_html_tags(block.get("html", ""))
                if text.strip():
                    lines.append(f"<a id='{uuid_str}'></a>\n{text.strip()}")
            page_markdown = "\n\n".join(lines)
            
        if not page_markdown.strip():
            continue
            
        chunks = text_splitter.split_text(page_markdown)
        for chunk in chunks:
            docs.append(Document(page_content=chunk, metadata={"page_num": page_num}))
            
    if not docs:
        return False
        
    embeddings = get_embeddings()
    vectorstore = FAISS.from_documents(docs, embeddings)
    vectorstore.save_local(index_path)
    
    # Build and save BM25 retriever
    bm25_retriever = BM25Retriever.from_documents(docs)
    with open(bm25_path, "wb") as f:
        pickle.dump(bm25_retriever, f)
        
    return True

def retrieve(uid: str, query: str, top_k: int = 5):
    """Searches using Hybrid Search (BM25 + FAISS) and returns top K matching chunks."""
    doc_dir = os.path.join("data", uid)
    index_path = os.path.join(doc_dir, "faiss_index")
    bm25_path = os.path.join(doc_dir, "bm25_index.pkl")
    
    if not os.path.exists(index_path):
        success = build_index(uid)
        if not success:
            return []
            
    embeddings = get_embeddings()
    vectorstore = FAISS.load_local(index_path, embeddings, allow_dangerous_deserialization=True)
    # Retrieve a larger pool of chunks (e.g. 20) for the Cross-Encoder to re-rank
    pool_k = top_k * 4
    faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": pool_k})
    
    with open(bm25_path, "rb") as f:
        bm25_retriever = pickle.load(f)
    bm25_retriever.k = pool_k
    
    # Combine them using Reciprocal Rank Fusion
    ensemble_retriever = EnsembleRetriever(
        retrievers=[bm25_retriever, faiss_retriever], weights=[0.5, 0.5]
    )
    
    pool_docs = ensemble_retriever.invoke(query)
    
    # Cross-Encoder Re-Ranking
    if pool_docs:
        encoder = get_cross_encoder()
        pairs = [[query, doc.page_content] for doc in pool_docs]
        scores = encoder.predict(pairs)
        
        # Sort by score descending
        doc_score_pairs = list(zip(pool_docs, scores))
        doc_score_pairs.sort(key=lambda x: x[1], reverse=True)
        
        # Take the true top_k
        docs = [doc for doc, score in doc_score_pairs][:top_k]
    else:
        docs = []
    
    results = []
    for doc in docs:
        results.append({
            "text": doc.page_content,
            "metadata": doc.metadata
        })
        
    return results

def generate_answer(query: str, retrieved_chunks: list, model_name: str | None = None):
    """Uses Ollama to generate an answer based ONLY on the retrieved chunks."""
    model_name = settings.LLM_MODEL if model_name is None else model_name
    llm = ChatOllama(model=model_name)
    
    # Construct context from chunks
    context_parts = []
    for i, res in enumerate(retrieved_chunks):
        pg = res["metadata"].get("page_num", "?")
        context_parts.append(f"--- Chunk {i+1} (Page {pg}) ---\n{res['text']}")
        
    context_text = "\n\n".join(context_parts)
    
    print("\n" + "="*50)
    print("DEBUG: RETRIEVED CONTEXT CHUNKS")
    print("="*50)
    print(context_text)
    print("="*50 + "\n")
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an intelligent assistant. Use the following extracted context from a document to answer the user's question. If the answer is not contained within the context, simply state that you cannot find the answer in the document. Do not hallucinate.\n\nContext:\n{context}"),
        ("human", "{question}")
    ])
    
    chain = prompt | llm
    for chunk in chain.stream({"context": context_text, "question": query}):
        yield chunk.content
