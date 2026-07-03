import os
from typing import List, Optional
from pydantic import BaseModel, Field
from langchain_openai import ChatOpenAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.messages import SystemMessage, HumanMessage

# Initialize LLM with the same settings as agent.py
llm_base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
llm_api_key = os.getenv("OPENAI_API_KEY", "dummy-key-for-local")
llm_model = os.getenv("LLM_MODEL", "gpt-3.5-turbo")

llm = ChatOpenAI(
    model=llm_model,
    base_url=llm_base_url,
    api_key=llm_api_key,
    temperature=0
)

# Output schema for extracting feedback
class PostTravelFeedback(BaseModel):
    satisfaction_score: float = Field(description="Satisfaction score from 1 to 5, where 1 is terrible and 5 is excellent. Extract from the user's feedback if implied.")
    pain_points: List[str] = Field(description="A list of free-form text strings describing specific negative experiences, issues, or pain points mentioned.")
    reflections: str = Field(description="A summary of unstructured reflections, thoughts, and general feedback provided by the user.")

# Chain to extract structured feedback
extraction_llm = llm.with_structured_output(PostTravelFeedback)

def generate_outreach_message(itinerary_details: dict) -> str:
    """Generate a context-aware outreach message asking for feedback after a trip."""
    system_prompt = SystemMessage(content="You are a helpful travel assistant. The user just completed a trip. Generate a friendly, short outreach message asking how their trip was and if they have any feedback.")
    human_prompt = HumanMessage(content=f"Trip details: {itinerary_details}. Please write the outreach message.")
    
    response = llm.invoke([system_prompt, human_prompt])
    return response.content

def extract_feedback(user_feedback: str) -> PostTravelFeedback:
    """Extract structured satisfaction score and pain points, plus unstructured reflections."""
    system_prompt = ChatPromptTemplate.from_messages([
        ("system", "You are an expert at extracting structured feedback from user travel reviews."),
        ("human", "Extract the satisfaction score (1-5), pain points, and general reflections from the following feedback:\n\n{feedback}")
    ])
    
    chain = system_prompt | extraction_llm
    return chain.invoke({"feedback": user_feedback})
