from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from typing import List, Optional
import os
import requests
import json
from dotenv import load_dotenv
import google.generativeai as genai
import logging
import re

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="LegalEase RAG Service", version="1.0.0")

# Configuration
GOOGLE_API_KEY = os.getenv("GOOGLE_API_KEY")
INDIAN_KANOON_API_KEY = os.getenv("INDIAN_KANOON_API_KEY")

# Initialize Gemini
if GOOGLE_API_KEY:
    genai.configure(api_key=GOOGLE_API_KEY)
    model = genai.GenerativeModel('gemini-1.5-pro-latest')
    logger.info("Google Gemini API configured successfully")
else:
    logger.warning("Google API key not found!")
    model = None

# Sample legal cases for demonstration
SAMPLE_LEGAL_CASES = [
    {
        'case_title': 'State of Maharashtra vs. Ram Kumar',
        'facts': 'Property dispute involving agricultural land ownership rights between two parties. The dispute arose when defendant claimed ownership of 5 acres of agricultural land.',
        'judgment': 'Court ruled in favor of plaintiff based on registered sale deed and property documents. Defendant failed to provide sufficient evidence of ownership.',
        'legal_issues': 'Property rights, land ownership verification, documentary evidence',
        'court': 'Bombay High Court',
        'year': '2023',
        'citation': '2023 BHC 456'
    },
    {
        'case_title': 'ABC Corporation vs. XYZ Limited',
        'facts': 'Breach of supply contract where defendant failed to deliver goods as per agreed timeline. Contract worth Rs. 50 lakhs was violated.',
        'judgment': 'Court awarded compensation of Rs. 15 lakhs for breach of contract and additional damages for delayed delivery.',
        'legal_issues': 'Contract law, breach of contract, damages, specific performance',
        'court': 'Delhi High Court',
        'year': '2023',
        'citation': '2023 DHC 789'
    },
    {
        'case_title': 'Priya Sharma vs. Tech Solutions Pvt Ltd',
        'facts': 'Wrongful termination case where employee was dismissed without proper notice or cause after 3 years of service.',
        'judgment': 'Employee awarded reinstatement with 80% back wages. Company directed to follow proper termination procedures.',
        'legal_issues': 'Employment law, wrongful termination, industrial disputes, back wages',
        'court': 'Karnataka High Court',
        'year': '2023',
        'citation': '2023 KHC 234'
    },
    {
        'case_title': 'Union Bank vs. Rajesh Enterprises',
        'facts': 'Recovery suit for non-payment of loan amount of Rs. 25 lakhs with interest. Borrower defaulted on EMI payments.',
        'judgment': 'Court directed immediate recovery of principal amount with 12% interest. Asset attachment ordered.',
        'legal_issues': 'Banking law, loan recovery, interest calculation, asset attachment',
        'court': 'Punjab & Haryana High Court',
        'year': '2023',
        'citation': '2023 PHC 567'
    },
    {
        'case_title': 'Municipal Corporation vs. Green Builders',
        'facts': 'Unauthorized construction case where builder constructed additional floors without proper permissions.',
        'judgment': 'Demolition ordered for unauthorized portion. Builder fined Rs. 10 lakhs for violation of building norms.',
        'legal_issues': 'Municipal law, building regulations, unauthorized construction, penalties',
        'court': 'Gujarat High Court',
        'year': '2023',
        'citation': '2023 GHC 345'
    },
    {
        'case_title': 'Sunita Devi vs. State of UP',
        'facts': 'Consumer protection case against defective electronic goods sold without proper warranty coverage.',
        'judgment': 'Consumer forum awarded replacement of product plus Rs. 5000 compensation for mental agony.',
        'legal_issues': 'Consumer protection, defective goods, warranty claims, compensation',
        'court': 'Allahabad High Court',
        'year': '2023',
        'citation': '2023 AHC 678'
    },
    {
        'case_title': 'Highway Construction Co. vs. State Government',
        'facts': 'Dispute over delayed payment for government road construction project worth Rs. 2 crores.',
        'judgment': 'Government directed to release pending payment with 8% interest within 60 days.',
        'legal_issues': 'Government contracts, delayed payments, public works, interest on dues',
        'court': 'Rajasthan High Court',
        'year': '2023',
        'citation': '2023 RHC 890'
    },
    {
        'case_title': 'Dr. Amit vs. Medical Council',
        'facts': 'Professional misconduct case against doctor for alleged negligence in patient treatment.',
        'judgment': 'Doctor suspended for 6 months. Directed to undergo refresher training before resuming practice.',
        'legal_issues': 'Medical negligence, professional conduct, medical council regulations',
        'court': 'Supreme Court of India',
        'year': '2023',
        'citation': '2023 SC 123'
    }
]

class ChatRequest(BaseModel):
    message: str
    user_id: Optional[str] = None

class ChatResponse(BaseModel):
    response: str
    sources: List[dict] = []
    success: bool = True

def simple_text_search(query: str, cases: List[dict], top_k: int = 3):
    """Simple keyword-based search through cases"""
    query_words = set(query.lower().split())
    scored_cases = []
    
    for case in cases:
        # Create searchable text from case
        searchable_text = f"{case['facts']} {case['judgment']} {case['legal_issues']} {case['case_title']}".lower()
        
        # Count matching words
        matches = sum(1 for word in query_words if word in searchable_text)
        
        # Boost score for exact phrase matches
        if query.lower() in searchable_text:
            matches += 2
            
        if matches > 0:
            scored_cases.append((case, matches))
    
    # Sort by score and return top results
    scored_cases.sort(key=lambda x: x[1], reverse=True)
    return [case for case, score in scored_cases[:top_k]]

def get_indian_kanoon_cases(query: str, limit: int = 5):
    """Search Indian Kanoon API for relevant cases using their official API"""
    if not INDIAN_KANOON_API_KEY:
        logger.warning("Indian Kanoon API key not available")
        return []
    
    try:
        # Try POST method first (as per documentation)
        url = "https://api.indiankanoon.org/search/"
        headers = {
            'Authorization': f'Token {INDIAN_KANOON_API_KEY}',
            'Accept': 'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'LegalEase-AI/1.0'
        }
        
        # POST data as form-encoded
        form_data = {
            'formInput': query,
            'pagenum': 0
        }
        
        logger.info(f"Trying POST to Indian Kanoon API for: {query}")
        logger.info(f"Using API key: {INDIAN_KANOON_API_KEY[:15]}...")
        
        response = requests.post(url, headers=headers, data=form_data, timeout=15)
        logger.info(f"Indian Kanoon POST response status: {response.status_code}")
        
        if response.status_code == 405:
            # If POST not allowed, try GET method
            logger.info("POST method not allowed, trying GET...")
            get_url = f"https://api.indiankanoon.org/search/"
            get_headers = {
                'Authorization': f'Token {INDIAN_KANOON_API_KEY}',
                'Accept': 'application/json',
                'User-Agent': 'LegalEase-AI/1.0'
            }
            get_params = {
                'formInput': query,
                'pagenum': 0
            }
            
            response = requests.get(get_url, headers=get_headers, params=get_params, timeout=15)
            logger.info(f"Indian Kanoon GET response status: {response.status_code}")
        
        if response.status_code == 200:
            try:
                response_text = response.text
                logger.info(f"Response preview: {response_text[:300]}...")
                
                # Try to parse as JSON
                try:
                    data = response.json()
                except json.JSONDecodeError:
                    logger.error("Response is not valid JSON")
                    logger.error(f"Raw response: {response_text[:500]}")
                    return []
                
                logger.info(f"Indian Kanoon JSON response received with keys: {list(data.keys())}")
                
                # Parse the response according to their documentation format
                results = []
                
                # Check different possible response formats
                if isinstance(data, list):
                    # Direct list of cases
                    docs = data[:limit]
                elif 'docs' in data:
                    # Response with 'docs' key
                    docs = data['docs'][:limit]
                elif 'results' in data:
                    # Response with 'results' key
                    docs = data['results'][:limit]
                else:
                    # Try to find any array in the response
                    for key, value in data.items():
                        if isinstance(value, list) and len(value) > 0:
                            docs = value[:limit]
                            logger.info(f"Found documents under key: {key}")
                            break
                    else:
                        logger.warning(f"Unknown response format: {list(data.keys())}")
                        return []
                
                for doc in docs:
                    # Handle different document formats
                    title = doc.get('title', '') or doc.get('case_name', '') or doc.get('name', 'Untitled Case')
                    doc_id = doc.get('tid', '') or doc.get('id', '') or doc.get('doc_id', '')
                    headline = doc.get('headline', '') or doc.get('summary', '') or doc.get('description', '')
                    source = doc.get('docsource', '') or doc.get('court', '') or doc.get('source', 'Indian Kanoon')
                    
                    results.append({
                        'title': title,
                        'tid': doc_id,
                        'headline': headline,
                        'docsource': source,
                        'docsize': doc.get('docsize', 0),
                        'url': f"https://indiankanoon.org/doc/{doc_id}/" if doc_id else "",
                        'summary': headline,
                        'source': 'Indian Kanoon API'
                    })
                
                logger.info(f"Successfully parsed {len(results)} cases from Indian Kanoon")
                return results
                
            except Exception as parse_error:
                logger.error(f"Error parsing Indian Kanoon response: {parse_error}")
                logger.error(f"Response content: {response.text[:500]}")
                return []
        
        elif response.status_code == 401 or response.status_code == 403:
            logger.error(f"Indian Kanoon API authentication failed: {response.status_code}")
            logger.error(f"Response: {response.text}")
            return []
        else:
            logger.warning(f"Indian Kanoon API returned status {response.status_code}")
            logger.warning(f"Response: {response.text[:200]}")
            return []
            
    except Exception as e:
        logger.error(f"Error calling Indian Kanoon API: {e}")
        return []

def get_case_document(doc_id: str):
    """Get full document content from Indian Kanoon API"""
    if not INDIAN_KANOON_API_KEY or not doc_id:
        return None
    
    try:
        url = f"https://api.indiankanoon.org/doc/{doc_id}/"
        headers = {
            'Authorization': f'Token {INDIAN_KANOON_API_KEY}',
            'Accept': 'application/json'
        }
        
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            return response.json()
        else:
            logger.warning(f"Failed to get document {doc_id}: {response.status_code}")
            return None
            
    except Exception as e:
        logger.error(f"Error getting document {doc_id}: {e}")
        return None

def generate_ai_response(query: str, context: str):
    """Generate AI response using Gemini"""
    if not model:
        return generate_fallback_response(query)
    
    try:
        prompt = f"""
        You are a legal AI assistant for Indian law. Based on the following legal case context, 
        provide a helpful and accurate response to the user's query.
        
        User Query: {query}
        
        Relevant Legal Cases:
        {context}
        
        Please provide:
        1. A direct answer to the query based on the cases shown
        2. Key legal principles that apply
        3. Practical next steps the user should consider
        
        Keep the response professional, concise, and helpful. Always recommend consulting with a qualified legal professional for specific legal advice.
        """
        
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        logger.error(f"Error generating AI response: {e}")
        return generate_fallback_response(query)

def generate_fallback_response(query: str):
    """Generate fallback response when AI fails"""
    matching_cases = simple_text_search(query, SAMPLE_LEGAL_CASES, 2)
    if matching_cases:
        case_summaries = []
        for case in matching_cases:
            case_summaries.append(f"• {case['case_title']}: {case['judgment']}")
        
        fallback_response = f"""Based on similar legal cases in our database:

{chr(10).join(case_summaries)}

Key considerations for your query about "{query}":
- Review relevant case law and precedents
- Gather all necessary documentation
- Consider the specific legal principles that apply
- Consult with a qualified legal professional for personalized advice

This is based on similar cases and general legal principles. For specific legal advice tailored to your situation, please consult with a practicing lawyer."""
        return fallback_response
    else:
        return f"I understand you're asking about: {query}. I recommend consulting with a qualified legal professional who can provide specific advice for your situation."

@app.on_event("startup")
async def startup_event():
    """Initialize service on startup"""
    logger.info("Starting LegalEase RAG Service...")
    logger.info(f"Loaded {len(SAMPLE_LEGAL_CASES)} sample legal cases")
    if GOOGLE_API_KEY:
        logger.info("Google Gemini API key found")
    if INDIAN_KANOON_API_KEY:
        logger.info("Indian Kanoon API key found")

@app.get("/health")
async def health_check():
    return {"status": "healthy", "service": "LegalEase RAG"}

@app.post("/chat", response_model=ChatResponse)
async def chat_endpoint(request: ChatRequest):
    """Main chat endpoint for legal queries - prioritizes Indian Kanoon API"""
    try:
        query = request.message.strip()
        if not query:
            raise HTTPException(status_code=400, detail="Empty query")
        
        # First, get live cases from Indian Kanoon API (primary source)
        indian_kanoon_cases = get_indian_kanoon_cases(query, limit=3)
        
        # Then get similar cases from local database as supplement
        similar_cases = simple_text_search(query, SAMPLE_LEGAL_CASES, 2)
        
        # Prepare context with Indian Kanoon cases taking priority
        context_parts = []
        sources = []
        
        # Add Indian Kanoon cases first (higher priority)
        for case in indian_kanoon_cases:
            context_parts.append(f"""
LIVE CASE from Indian Kanoon:
Title: {case['title']}
Source: {case.get('docsource', 'Indian Kanoon')}
Summary: {case.get('headline', 'Case summary not available')}
Document ID: {case.get('tid', 'N/A')}
""")
            sources.append({
                'title': case['title'],
                'url': case.get('url', ''),
                'docsource': case.get('docsource', 'Indian Kanoon'),
                'tid': case.get('tid', ''),
                'type': 'indian_kanoon',
                'priority': 'high'
            })
        
        # Add local cases as supplementary context
        for case in similar_cases:
            context_parts.append(f"""
REFERENCE CASE from Database:
Title: {case['case_title']} ({case['year']})
Court: {case['court']}
Facts: {case['facts']}
Judgment: {case['judgment']}
Legal Issues: {case['legal_issues']}
""")
            sources.append({
                'title': case['case_title'],
                'court': case['court'],
                'year': case['year'],
                'citation': case.get('citation', 'N/A'),
                'type': 'local_database',
                'priority': 'medium'
            })
        
        context = "\n".join(context_parts) if context_parts else "No specific matching cases found."
        
        # Generate AI response
        ai_response = generate_ai_response(query, context)
        
        return ChatResponse(
            response=ai_response,
            sources=sources,
            success=True
        )
        
    except Exception as e:
        logger.error(f"Error in chat endpoint: {e}")
        return ChatResponse(
            response="I apologize, but I encountered an error while processing your request. Please try again or contact support.",
            sources=[],
            success=False
        )

@app.get("/search")
async def search_cases(q: str, limit: int = 10):
    """Search endpoint for case research - prioritizes Indian Kanoon API"""
    try:
        logger.info(f"Search request received: '{q}' with limit {limit}")
        
        # First, get cases from Indian Kanoon API (primary source)
        indian_kanoon_cases = get_indian_kanoon_cases(q, limit=min(8, limit))
        
        # Then get some from local database as fallback/supplement
        local_cases = simple_text_search(q, SAMPLE_LEGAL_CASES, min(5, limit))
        
        # Format Indian Kanoon results
        ik_formatted = []
        for case in indian_kanoon_cases:
            ik_formatted.append({
                'title': case['title'],
                'tid': case.get('tid', ''),
                'headline': case.get('headline', ''),
                'docsource': case.get('docsource', ''),
                'docsize': case.get('docsize', 0),
                'url': case.get('url', ''),
                'summary': case.get('headline', ''),
                'source': 'Indian Kanoon API',
                'type': 'live_case'
            })
        
        # Format local results
        local_formatted = []
        for case in local_cases:
            local_formatted.append({
                'title': case['case_title'],
                'court': case['court'],
                'year': case['year'],
                'citation': case.get('citation', 'N/A'),
                'facts': case['facts'],
                'judgment': case['judgment'],
                'legal_issues': case['legal_issues'],
                'source': 'Local Database',
                'type': 'sample_case'
            })
        
        results = {
            'query': q,
            'indian_kanoon_cases': ik_formatted,
            'local_cases': local_formatted,
            'total_results': len(ik_formatted) + len(local_formatted),
            'primary_source': 'Indian Kanoon API',
            'api_status': 'active' if indian_kanoon_cases else 'no_results',
            'success': True
        }
        
        logger.info(f"Search completed: {len(ik_formatted)} from Indian Kanoon, {len(local_formatted)} local")
        return results
        
    except Exception as e:
        logger.error(f"Error in search endpoint: {e}")
        return {
            'query': q,
            'indian_kanoon_cases': [],
            'local_cases': simple_text_search(q, SAMPLE_LEGAL_CASES, min(5, limit)),
            'total_results': min(5, limit),
            'primary_source': 'Local Database Only',
            'api_status': 'error',
            'success': False,
            'error': str(e)
        }

@app.get("/document/{doc_id}")
async def get_document(doc_id: str):
    """Get full document details"""
    try:
        # Try to get from Indian Kanoon first
        doc = get_case_document(doc_id)
        if doc:
            return {"success": True, "document": doc, "source": "Indian Kanoon"}
        else:
            return {"success": False, "error": "Document not found"}
    except Exception as e:
        logger.error(f"Error fetching document {doc_id}: {e}")
        return {"success": False, "error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)