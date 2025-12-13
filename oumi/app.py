#!/usr/bin/env python3
"""
Oumi API Server - FastAPI server for code analysis
Returns GitHub issue-formatted results
"""

import os
import sys
import logging
import asyncio
from concurrent.futures import ThreadPoolExecutor
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
from pathlib import Path

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

sys.path.insert(0, str(Path(__file__).parent))

load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

logger.info("=" * 60)
logger.info("🚀 Starting Oumi Code Analysis API")
logger.info("=" * 60)
logger.info(f"Python: {sys.version}")
logger.info(f"Working directory: {os.getcwd()}")
logger.info(f"OPENAI_API_KEY present: {'✅ YES' if os.getenv('OPENAI_API_KEY') else '❌ NO - REQUIRED!'}")

ANALYZER_AVAILABLE = False
OumiAnalyzer = None
analyzer_instance = None
executor = ThreadPoolExecutor(max_workers=4)

def import_analyzer():
    global ANALYZER_AVAILABLE, OumiAnalyzer
    try:
        logger.info("⏳ Importing OumiAnalyzer (this may take 30-60 seconds)...")
        from analyzer import OumiAnalyzer as _OumiAnalyzer
        OumiAnalyzer = _OumiAnalyzer
        ANALYZER_AVAILABLE = True
        logger.info("✅ OumiAnalyzer imported successfully")
        return True
    except Exception as e:
        import traceback
        logger.error(f"❌ Failed to import OumiAnalyzer: {e}")
        logger.error(f"Traceback: {traceback.format_exc()}")
        ANALYZER_AVAILABLE = False
        OumiAnalyzer = None
        return False

def get_analyzer():
    global analyzer_instance
    if analyzer_instance is None and ANALYZER_AVAILABLE:
        try:
            logger.info("Initializing OumiAnalyzer instance...")
            analyzer_instance = OumiAnalyzer()
            logger.info("✅ OumiAnalyzer instance created")
        except Exception as e:
            import traceback
            logger.error(f"❌ Failed to create OumiAnalyzer instance: {e}")
            logger.error(f"Traceback: {traceback.format_exc()}")
            return None
    return analyzer_instance

import_analyzer()

app = FastAPI(title="Oumi Code Analysis API", version="1.0.0")
logger.info("✅ FastAPI app created")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class FileInput(BaseModel):
    path: str
    content: str

class AnalysisOptions(BaseModel):
    type: Optional[List[str]] = ["bugs"]
    userPrompt: Optional[str] = None

class AnalysisRequest(BaseModel):
    files: List[FileInput]
    options: Optional[AnalysisOptions] = AnalysisOptions()

@app.get("/")
async def root():
    return {
        "service": "Oumi Code Analysis API",
        "version": "1.0.0",
        "status": "running",
        "powered_by": "Oumi Inference Engine"
    }

@app.get("/health")
async def health():
    return {"status": "healthy"}

@app.post("/api/analyze")
async def analyze_code(request: AnalysisRequest):
    """Analyze code files and return GitHub issue-formatted results."""
    if not ANALYZER_AVAILABLE:
        raise HTTPException(
            status_code=503,
            detail="OumiAnalyzer is not available. Check server logs for details."
        )
    
    try:
        if not request.files:
            raise HTTPException(status_code=400, detail="No files provided")
        
        logger.info(f"Analyzing {len(request.files)} file(s)")
        analyzer = get_analyzer()
        if analyzer is None:
            raise HTTPException(
                status_code=503,
                detail="OumiAnalyzer instance could not be created. Check server logs."
            )
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        analysis_types = request.options.type if request.options and request.options.type else ["bugs"]
        if isinstance(analysis_types, str):
            analysis_types = [analysis_types]
        user_prompt = request.options.userPrompt if request.options and request.options.userPrompt else None
        
        loop = asyncio.get_event_loop()
        results = await loop.run_in_executor(
            executor,
            analyzer.analyze_files,
            files_data,
            analysis_types,
            user_prompt
        )
        
        logger.info(f"Analysis complete: {sum(len(r.get('issues', [])) for r in results)} issues found")
        return {
            "summary": {
                "total_files": len(request.files),
                "total_issues": sum(len(r.get("issues", [])) for r in results),
                "files_with_issues": sum(1 for r in results if r.get("issues")),
                "powered_by": "Oumi Inference Engine"
            },
            "results": results
        }
    
    except Exception as e:
        logger.error(f"Analysis error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

@app.on_event("startup")
async def startup_event():
    port = int(os.getenv("PORT", 7860))
    logger.info("=" * 60)
    logger.info(f"🎉 Server starting on port {port}")
    logger.info(f"Health check: http://0.0.0.0:{port}/health")
    logger.info(f"API docs: http://0.0.0.0:{port}/docs")
    logger.info(f"Concurrent requests: Enabled (max {executor._max_workers} workers)")
    if not ANALYZER_AVAILABLE:
        logger.warning("⚠️  OumiAnalyzer not available - /api/analyze will fail")
        logger.warning("⚠️  Check OPENAI_API_KEY is set in environment variables")
    else:
        logger.info("⏳ Pre-initializing analyzer instance...")
        get_analyzer()
    logger.info("=" * 60)

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down thread pool executor...")
    executor.shutdown(wait=False)

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 7860))
    logger.info(f"Starting uvicorn on port {port}")
    uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")

