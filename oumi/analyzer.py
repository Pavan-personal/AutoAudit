#!/usr/bin/env python3
"""
Oumi Analyzer - Analyzes code and formats as GitHub issues
"""

import os
import re
import ast
from typing import List, Dict, Any, Optional
from pathlib import Path
from dotenv import load_dotenv

try:
    from tree_sitter import Language, Parser
    import tree_sitter_python as ts_python
    import tree_sitter_javascript as ts_javascript
    import tree_sitter_typescript as ts_typescript
    import tree_sitter_java as ts_java
    import tree_sitter_go as ts_go
    import tree_sitter_rust as ts_rust
    import tree_sitter_c as ts_c
    import tree_sitter_cpp as ts_cpp
    import tree_sitter_c_sharp as ts_csharp
    import tree_sitter_php as ts_php
    import tree_sitter_ruby as ts_ruby
    import tree_sitter_bash as ts_bash
    import tree_sitter_html as ts_html
    import tree_sitter_css as ts_css
    import tree_sitter_dockerfile as ts_dockerfile
    import tree_sitter_kotlin as ts_kotlin
    import tree_sitter_json as ts_json
    import tree_sitter_sql as ts_sql
    TREE_SITTER_AVAILABLE = True
except ImportError:
    TREE_SITTER_AVAILABLE = False

load_dotenv()
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '..', '.env'))

try:
    from oumi.inference import OpenAIInferenceEngine
    from oumi.core.configs import ModelParams, GenerationParams
    from oumi.core.types.conversation import Conversation, Message, Role
    OUMI_AVAILABLE = True
except ImportError as e:
    OUMI_AVAILABLE = False
    raise ImportError(f"Oumi not installed: {e}")

class OumiAnalyzer:
    def __init__(self, model_name: str = "gpt-4o-mini"):
        if model_name.startswith('openai/'):
            model_name = model_name.replace('openai/', '')
        self.model_name = model_name
        self.engine = None
        self.parsers = {}
        self._initialize_engine()
        self._initialize_tree_sitter()
    
    def _initialize_engine(self):
        model_params = ModelParams(model_name=self.model_name)
        generation_params = GenerationParams(
            max_new_tokens=3000,
            temperature=1.0
        )
        self.engine = OpenAIInferenceEngine(
            model_params=model_params,
            generation_params=generation_params
        )
    
    def _initialize_tree_sitter(self):
        """Initialize Tree-sitter parsers for multi-language syntax checking."""
        if not TREE_SITTER_AVAILABLE:
            return
        
        try:
            lang_map = {
                '.py': ts_python.language(),
                '.js': ts_javascript.language(),
                '.jsx': ts_javascript.language(),
                '.ts': ts_typescript.language_typescript(),
                '.tsx': ts_typescript.language_tsx(),
                '.java': ts_java.language(),
                '.go': ts_go.language(),
                '.rs': ts_rust.language(),
                '.c': ts_c.language(),
                '.cpp': ts_cpp.language(),
                '.cc': ts_cpp.language(),
                '.cxx': ts_cpp.language(),
                '.h': ts_c.language(),
                '.hpp': ts_cpp.language(),
                '.cs': ts_csharp.language(),
                '.php': ts_php.language(),
                '.rb': ts_ruby.language(),
                '.sh': ts_bash.language(),
                '.bash': ts_bash.language(),
                '.html': ts_html.language(),
                '.htm': ts_html.language(),
                '.css': ts_css.language(),
                '.dockerfile': ts_dockerfile.language(),
                '.kt': ts_kotlin.language(),
                '.kts': ts_kotlin.language(),
                '.json': ts_json.language(),
                '.sql': ts_sql.language()
            }
            
            for ext, lang in lang_map.items():
                parser = Parser()
                parser.set_language(lang)
                self.parsers[ext] = parser
        except Exception as e:
            pass
    
    def _get_file_language(self, file_path: str) -> str:
        """Detect language/file type from extension."""
        ext_map = {
            '.js': 'JavaScript', '.jsx': 'JavaScript (React)', '.ts': 'TypeScript', '.tsx': 'TypeScript (React)',
            '.py': 'Python', '.pyw': 'Python',
            '.java': 'Java', '.kt': 'Kotlin', '.scala': 'Scala',
            '.go': 'Go', '.rs': 'Rust', '.c': 'C', '.cpp': 'C++', '.cc': 'C++', '.cxx': 'C++', '.h': 'C/C++ Header',
            '.cs': 'C#', '.vb': 'Visual Basic', '.fs': 'F#',
            '.rb': 'Ruby', '.php': 'PHP', '.swift': 'Swift', '.m': 'Objective-C',
            '.dart': 'Dart', '.lua': 'Lua', '.perl': 'Perl', '.pl': 'Perl',
            '.sh': 'Shell', '.bash': 'Bash', '.zsh': 'Zsh',
            '.sol': 'Solidity', '.vy': 'Vyper',
            '.html': 'HTML', '.htm': 'HTML', '.xml': 'XML', '.css': 'CSS', '.scss': 'SCSS', '.sass': 'Sass', '.less': 'Less',
            '.json': 'JSON', '.yaml': 'YAML', '.yml': 'YAML', '.toml': 'TOML', '.ini': 'INI', '.conf': 'Config',
            '.sql': 'SQL', '.graphql': 'GraphQL', '.gql': 'GraphQL',
            '.md': 'Markdown', '.rst': 'reStructuredText', '.tex': 'LaTeX',
            '.r': 'R', '.jl': 'Julia', '.ex': 'Elixir', '.exs': 'Elixir', '.erl': 'Erlang',
            '.clj': 'Clojure', '.hs': 'Haskell', '.ml': 'OCaml',
            '.dockerfile': 'Dockerfile', '.proto': 'Protocol Buffer',
            '.vue': 'Vue', '.svelte': 'Svelte'
        }
        ext = Path(file_path).suffix.lower()
        return ext_map.get(ext, 'Unknown')
    
    def _check_syntax_errors(self, file_path: str, content: str) -> Optional[Dict[str, Any]]:
        """Check for syntax errors using Tree-sitter (multi-language) or AST (Python fallback)."""
        file_ext = Path(file_path).suffix.lower()
        file_lang = self._get_file_language(file_path)
        
        # Try Tree-sitter first (supports multiple languages)
        if TREE_SITTER_AVAILABLE and file_ext in self.parsers:
            try:
                tree = self.parsers[file_ext].parse(content.encode('utf-8'))
                
                if tree.root_node.has_error:
                    errors = []
                    self._find_syntax_errors(tree.root_node, errors, content)
                    
                    if errors:
                        error_msg = "\n".join([f"Line {e['line']}: {e['msg']}" for e in errors[:5]])
                        
                        body = f"""## File
`{file_path}`

## Priority
**HIGH**

## Type
bugs

---

**Syntax Errors Detected ({file_lang}):**

{error_msg}

This code will fail to compile/run.

---
*Detected by Tree-sitter + Oumi*
"""
                        tags = ["syntax-error", file_lang.lower().split()[0], "compilation-error"]
                        return {
                            "title": f"Syntax Error: {Path(file_path).name}",
                            "body": body,
                            "tags": tags
                        }
            except Exception:
                pass
        
        # Fallback to Python AST for Python files
        if file_ext == '.py':
            try:
                ast.parse(content)
            except SyntaxError as e:
                error_msg = f"Syntax Error on line {e.lineno}: {e.msg}\n"
                if e.text:
                    error_msg += f"Code: {e.text.strip()}\n"
                    if e.offset:
                        error_msg += f"      {' ' * (e.offset - 1)}^\n"
                
                body = f"""## File
`{file_path}`

## Priority
**HIGH**

## Type
bugs

---

**Syntax Error Detected:**

{error_msg}

This code will fail to compile/run.

---
*Analysis powered by Oumi Inference Engine*
"""
                return {
                    "title": f"Syntax Error: {Path(file_path).name}",
                    "body": body,
                    "tags": ["syntax-error", "python", "compilation-error"]
                }
            except Exception:
                pass
        
        return None
    
    def _find_syntax_errors(self, node, errors: List[Dict], content: str):
        """Recursively find ERROR nodes in Tree-sitter parse tree."""
        if node.type == 'ERROR':
            line_num = node.start_point[0] + 1
            line_content = content.split('\n')[node.start_point[0]] if node.start_point[0] < len(content.split('\n')) else ""
            errors.append({
                'line': line_num,
                'msg': f"Syntax error in code: {line_content.strip()[:50]}"
            })
        
        for child in node.children:
            self._find_syntax_errors(child, errors, content)
    
    def _determine_priority(self, analysis_text: str) -> str:
        """Determine priority based on severity keywords in analysis."""
        text_lower = analysis_text.lower()
        
        critical_keywords = ['critical', 'security vulnerability', 'sql injection', 'xss', 'csrf', 'authentication bypass', 'data breach', 'exposed secret', 'hardcoded password']
        high_keywords = ['syntax error', 'compilation error', 'runtime error', 'undefined variable', 'null pointer', 'exception', 'crash', 'bug', 'error', 'typeerror', 'nameerror', 'attributeerror']
        medium_keywords = ['warning', 'deprecated', 'performance issue', 'memory leak', 'infinite loop']
        low_keywords = ['suggestion', 'improvement', 'best practice', 'style', 'formatting']
        
        if any(keyword in text_lower for keyword in critical_keywords):
            return "critical"
        elif any(keyword in text_lower for keyword in high_keywords):
            return "high"
        elif any(keyword in text_lower for keyword in medium_keywords):
            return "medium"
        elif any(keyword in text_lower for keyword in low_keywords):
            return "low"
        else:
            return "medium"
    
    def _format_as_github_issue(self, file_path: str, issue_title: str, issue_body: str, priority: str, analysis_type: str) -> Dict[str, str]:
        """Format analysis as GitHub issue payload."""
        body = f"""## File
`{file_path}`

## Priority
**{priority.upper()}**

## Type
{analysis_type}

---

{issue_body}

---

*Analysis powered by Oumi Inference Engine*
"""
        
        return {
            "title": issue_title,
            "body": body,
            "tags": []
        }
    
    def _extract_tags(self, title: str, content: str, file_path: str) -> List[str]:
        """Extract 1-5 relevant tags for the issue."""
        tags = []
        text = (title + " " + content).lower()
        file_ext = Path(file_path).suffix.lower()
        
        error_tags = {
            'syntax': ['syntax error', 'syntaxerror', 'missing bracket', 'missing parenthesis', 'missing semicolon', 'unclosed', 'unterminated'],
            'type-error': ['type error', 'typeerror', 'type mismatch', 'wrong type', 'undefined type'],
            'runtime-error': ['runtime error', 'runtimeerror', 'null pointer', 'nullpointerexception', 'division by zero', 'array out of bounds'],
            'reference-error': ['reference error', 'referenceerror', 'undefined variable', 'undefined function', 'not defined'],
            'import-error': ['import error', 'importerror', 'module not found', 'cannot find module', 'missing import'],
            'compilation-error': ['compilation error', 'compile error', 'build error', 'build failed'],
            'sql-injection': ['sql injection', 'sql concatenation', 'query concatenation'],
            'xss': ['xss', 'cross-site scripting', 'innerhtml', 'dangerouslysetinnerhtml'],
            'command-injection': ['command injection', 'os.system', 'subprocess', 'eval', 'exec'],
            'security': ['security vulnerability', 'security issue', 'exposed secret', 'hardcoded password', 'api key'],
            'memory-leak': ['memory leak', 'unclosed resource', 'resource leak'],
            'performance': ['performance issue', 'infinite loop', 'blocking operation', 'unnecessary re-render'],
            'logic-error': ['logic error', 'incorrect condition', 'wrong operator', 'unreachable code']
        }
        
        for tag, keywords in error_tags.items():
            if any(keyword in text for keyword in keywords):
                tags.append(tag)
                if len(tags) >= 3:
                    break
        
        lang_tag = self._get_file_language(file_path).lower().split()[0]
        if lang_tag and lang_tag not in tags:
            tags.append(lang_tag)
        
        return tags[:5]
    
    def _parse_analysis_to_issues(self, file_path: str, analysis_text: str, analysis_types: List[str]) -> List[Dict[str, str]]:
        """Parse Oumi analysis text into separate GitHub issues based on severity."""
        issues = []
        
        if not analysis_text or len(analysis_text.strip()) < 20:
            return issues
        
        analysis_lower = analysis_text.lower().strip()
        if analysis_lower == "no issues detected." or analysis_lower == "no issues detected":
            return issues
        
        priority = self._determine_priority(analysis_text)
        types_str = ", ".join(analysis_types) if isinstance(analysis_types, list) else analysis_types
        
        issue_lines = []
        for line in analysis_text.split('\n'):
            line_stripped = line.strip()
            if line_stripped.startswith('- Line ') or line_stripped.startswith('* Line '):
                issue_lines.append(line_stripped)
        
        if issue_lines:
            for issue_line in issue_lines:
                issue_match = re.match(r'[-*]\s*Line\s+(\d+):\s*(.+)', issue_line)
                if issue_match:
                    line_num = issue_match.group(1)
                    issue_desc = issue_match.group(2).strip()
                    
                    issue_title = f"Line {line_num}: {issue_desc[:60]}"
                    if len(issue_desc) > 60:
                        issue_title += "..."
                    
                    tags = self._extract_tags(issue_title, issue_desc, file_path)
                    
                    issue = self._format_as_github_issue(
                        file_path=file_path,
                        issue_title=issue_title,
                        issue_body=f"**Line {line_num}:** {issue_desc}",
                        priority=priority,
                        analysis_type=types_str
                    )
                    issue["tags"] = tags
                    issues.append(issue)
        else:
            sections = re.split(r'\n###?\s+', analysis_text)
            if len(sections) < 2:
                sections = [analysis_text]
            
            for section in sections:
                section = section.strip()
                if not section or len(section) < 30:
                    continue
                
                if section.lower().startswith('issues'):
                    section = section[6:].strip()
                
                if not section:
                    continue
                
                lines = section.split('\n')
                section_title = lines[0][:80] if lines else "Code Issue"
                section_content = section
                
                tags = self._extract_tags(section_title, section_content, file_path)
                
                issue = self._format_as_github_issue(
                    file_path=file_path,
                    issue_title=f"{section_title}: {Path(file_path).name}",
                    issue_body=section_content,
                    priority=priority,
                    analysis_type=types_str
                )
                issue["tags"] = tags
                issues.append(issue)
        
        return issues
    
    def analyze_file(self, file_path: str, content: str, analysis_types: List[str], user_prompt: Optional[str] = None) -> Dict[str, Any]:
        """Analyze a single file and return GitHub issue-formatted results."""
        issues = []
        
        if "bugs" in analysis_types or "linting" in analysis_types or "build" in analysis_types:
            syntax_error = self._check_syntax_errors(file_path, content)
            if syntax_error:
                issues.append(syntax_error)
                return {
                    "file": file_path,
                    "status": "success",
                    "issues": issues,
                    "powered_by": "Oumi Inference Engine",
                    "model": self.model_name
                }
        
        types_str = ", ".join(analysis_types) if isinstance(analysis_types, list) else analysis_types
        user_context = f"\n{user_prompt}\n" if user_prompt else ""
        file_lang = self._get_file_language(file_path)
        
        prompt = f"""You are analyzing {file_lang} code for: {types_str}

```{Path(file_path).suffix[1:] if Path(file_path).suffix else 'text'}
{content[:80000]}
```

CHECK EVERY LINE for these issues:
- Syntax errors: missing ), }}, ], ;, quotes, typos (strin→string)  
- Division by zero: X/0
- SQL injection: "SELECT" + user_input
- Null access: value.property without null check
- Security: eval(), os.system(), hardcoded secrets
- Logic: if (x = 5) instead of ==, count && <Component/> shows 0

Report ALL problems found:
### Issues
- Line X: [problem description]

If NO problems: "No issues detected."{user_context}"""

        try:
            conversation = Conversation(
                messages=[Message(role=Role.USER, content=prompt)]
            )
            
            response_list = self.engine.infer([conversation])
            
            if response_list and len(response_list) > 0:
                updated_conversation = response_list[0]
                if hasattr(updated_conversation, 'messages') and len(updated_conversation.messages) > 0:
                    last_message = updated_conversation.messages[-1]
                    if hasattr(last_message, 'content'):
                        analysis_text = last_message.content
                    else:
                        analysis_text = str(last_message)
                else:
                    analysis_text = str(updated_conversation)
            else:
                analysis_text = "No response from model"
            
            parsed_issues = self._parse_analysis_to_issues(file_path, analysis_text, analysis_types)
            issues.extend(parsed_issues)
            
            return {
                "file": file_path,
                "status": "success",
                "issues": issues,
                "powered_by": "Oumi Inference Engine",
                "model": self.model_name
            }
            
        except Exception as e:
            return {
                "file": file_path,
                "status": "error",
                "issues": [],
                "error": str(e),
                "powered_by": "Oumi Inference Engine"
            }
    
    def analyze_files(self, files: List[Dict[str, str]], analysis_types: List[str], user_prompt: Optional[str] = None) -> List[Dict[str, Any]]:
        """Analyze multiple files."""
        results = []
        
        for file_data in files:
            result = self.analyze_file(
                file_path=file_data["path"],
                content=file_data["content"],
                analysis_types=analysis_types,
                user_prompt=user_prompt
            )
            results.append(result)
        
        return results

