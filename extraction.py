import os
import json
import re
import jsonschema
# pyrefly: ignore [missing-import]
from langchain_ollama import ChatOllama
from langchain_core.prompts import ChatPromptTemplate

def suggest_schema(document_text: str, model_name: str = "qwen2.5vl:7b") -> dict:
    """Uses Ollama to suggest a suitable JSON schema based on the document text."""
    # Truncate text to avoid model context overflow
    sample_text = document_text[:8000]
    
    prompt = f"""You are a data architect. Analyze the following document markdown and generate a JSON Schema (Draft-07 structure) that would be suitable to extract key structured information from this document.
    
    Examples of what schema fields could look like:
    - For invoices/receipts: invoice_number, invoice_date, vendor_name, line_items (array of objects), total_amount, etc.
    - For resumes/CVs: candidate_name, email, education (array of objects), work_experience (array of objects), skills, etc.
    - For reports/articles: title, author, key_findings (array of strings), summary, etc.
    
    Return ONLY a valid JSON Schema object. Do not include any markdown format tags like ```json or any introduction. Just return raw JSON.
    
    Document sample markdown:
    ---
    {sample_text}
    ---
    """
    
    try:
        llm = ChatOllama(model=model_name, format="json", temperature=0.2)
        response = llm.invoke(prompt)
        schema_candidate = response.content.strip()
        
        # Strip markdown markers if any got through
        if schema_candidate.startswith("```json"):
            schema_candidate = schema_candidate[7:]
        if schema_candidate.endswith("```"):
            schema_candidate = schema_candidate[:-3]
        schema_candidate = schema_candidate.strip()
        
        schema_dict = json.loads(schema_candidate)
        
        # Ensure it has basic JSON Schema fields, if not inject them
        if "type" not in schema_dict:
            schema_dict["type"] = "object"
        if "properties" not in schema_dict:
            schema_dict["properties"] = {}
            
        return schema_dict
    except Exception as e:
        print(f"Error suggesting schema: {e}")
        # Default fallback schema
        return {
            "$schema": "http://json-schema.org/draft-07/schema#",
            "title": "DefaultDocumentSchema",
            "type": "object",
            "properties": {
                "document_title": {
                    "type": "string",
                    "description": "The title or subject of the document"
                },
                "key_entities": {
                    "type": "array",
                    "items": { "type": "string" },
                    "description": "List of key names, organizations, or dates"
                },
                "summary": {
                    "type": "string",
                    "description": "A brief summary of the document"
                }
            },
            "required": ["document_title", "summary"]
        }

def clean_json_output(output_str: str) -> str:
    """Cleans code block formatting from LLM response string."""
    clean = output_str.strip()
    if clean.startswith("```json"):
        clean = clean[7:]
    elif clean.startswith("```"):
        clean = clean[3:]
    if clean.endswith("```"):
        clean = clean[:-3]
    return clean.strip()

def run_agentic_extraction(document_text: str, schema: dict, model_name: str = "qwen2.5vl:7b", threshold: int = 30000):
    """
    Runs extraction. If length is over threshold, logs switching to chunking
    and executes a truncated fallback direct extraction. Otherwise, executes direct agentic extraction.
    """
    doc_len = len(document_text)
    
    # SSE logs helper
    def log_evt(msg: str):
        return f"data: {json.dumps({'type': 'log', 'message': msg})}\n\n"
        
    def result_evt(data: dict):
        return f"data: {json.dumps({'type': 'result', 'data': data})}\n\n"
        
    yield log_evt("Initializing Agentic Extraction...")
    yield log_evt(f"Document character count: {doc_len} (Threshold: {threshold})")
    
    # Path decision
    if doc_len >= threshold:
        yield log_evt(f"[Routing] Document length exceeds threshold ({doc_len} >= {threshold}).")
        yield log_evt("[Routing] Switching to Advanced Chunking Method (Deferred to Phase 4).")
        yield log_evt(f"[Fallback] Performing Direct Agentic Extraction on truncated content (first {threshold} characters)...")
        working_text = document_text[:threshold]
    else:
        yield log_evt("[Routing] Document length is within threshold. Direct Agentic Extraction selected.")
        working_text = document_text
        
    max_attempts = 3
    attempt = 0
    error_msg = ""
    extracted_json = None
    
    llm = ChatOllama(model=model_name, format="json", temperature=0.0)
    
    while attempt < max_attempts:
        attempt += 1
        yield log_evt(f"Attempt {attempt} of {max_attempts}: Querying model...")
        
        if attempt == 1:
            prompt = f"""You are a precise data extraction agent. Extract structured information from the provided document markdown text so that it conforms strictly to the target JSON Schema.
            
            Target JSON Schema:
            {json.dumps(schema, indent=2)}
            
            Document Markdown Text:
            {working_text}
            
            Return ONLY a valid JSON object that conforms to the schema. Do not write any explanations, prefaces, or other text."""
        else:
            prompt = f"""Your previous JSON output did not conform to the JSON Schema.
            
            Target JSON Schema:
            {json.dumps(schema, indent=2)}
            
            Document Markdown Text:
            {working_text}
            
            Errors encountered during validation:
            {error_msg}
            
            Please correct the JSON output based on the Document Markdown Text. Return ONLY the corrected valid JSON object conforming to the schema. Do not write any explanations."""
            
        try:
            response = llm.invoke(prompt)
            output_str = clean_json_output(response.content)
            
            yield log_evt(f"Attempt {attempt}: Parsing output JSON...")
            data = json.loads(output_str)
            
            yield log_evt(f"Attempt {attempt}: Validating against schema...")
            jsonschema.validate(instance=data, schema=schema)
            
            yield log_evt("Success! JSON schema validation passed.")
            extracted_json = data
            break
            
        except json.JSONDecodeError as je:
            error_msg = f"JSON decoding failed: {str(je)}."
            yield log_evt(f"Warning: Attempt {attempt} output is invalid JSON. Error: {str(je)}")
            # Try to save what the raw string was to show in error debugging
            if attempt == max_attempts:
                yield log_evt("Failed to generate valid JSON after max retries.")
        except jsonschema.ValidationError as ve:
            # Format validation error path
            path = " -> ".join([str(p) for p in ve.path]) if ve.path else "root"
            error_msg = f"Schema validation failed: {ve.message} (at path '{path}')"
            yield log_evt(f"Warning: Attempt {attempt} failed schema validation: {ve.message} (at '{path}')")
            if attempt == max_attempts:
                yield log_evt("Failed to satisfy schema after max retries.")
        except Exception as e:
            error_msg = f"Unexpected error: {str(e)}"
            yield log_evt(f"Warning: Attempt {attempt} encountered unexpected error: {str(e)}")
            
    if extracted_json:
        yield result_evt(extracted_json)
    else:
        yield result_evt({"error": "Failed to extract valid JSON data conforming to the schema.", "raw_last_error": error_msg})
        
    yield "data: [DONE]\n\n"
