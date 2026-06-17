from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # Model Configurations
    LLM_MODEL: str = "qwen2.5vl:7b"
    EMBEDDING_MODEL: str = "qwen3-embedding:0.6b"
    RERANKER_MODEL: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    
    # Extraction Configurations
    EXTRACTION_THRESHOLD: int = 30000

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"

settings = Settings()
