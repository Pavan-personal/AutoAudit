#!/usr/bin/env python3
"""
Oumi API Server - FastAPI server for code analysis
Returns GitHub issue-formatted results
"""

import os
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from dotenv import load_dotenv
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
from analyzer import OumiAnalyzer

load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

app = FastAPI(title="Oumi Code Analysis API", version="1.0.0")

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
    try:
        if not request.files:
            raise HTTPException(status_code=400, detail="No files provided")
        
        analyzer = OumiAnalyzer()
        files_data = [{"path": f.path, "content": f.content} for f in request.files]
        analysis_types = request.options.type if request.options and request.options.type else ["bugs"]
        if isinstance(analysis_types, str):
            analysis_types = [analysis_types]
        user_prompt = request.options.userPrompt if request.options and request.options.userPrompt else None
        results = analyzer.analyze_files(
            files=files_data,
            analysis_types=analysis_types,
            user_prompt=user_prompt
        )
        
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
        raise HTTPException(status_code=500, detail=f"Analysis error: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run(app, host="0.0.0.0", port=port)

