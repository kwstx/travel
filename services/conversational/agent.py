import os
import json
from typing import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.checkpoint.redis import RedisSaver
import redis
from dotenv import load_dotenv
from langchain_core.messages import ToolMessage
from plugin_manager import plugin_registry
from itinerary_graph import itinerary_tools

load_dotenv()

class AgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    user_id: str
    context: str

@tool
def search_flights(destination: str, dates: str) -> str:
    """Search for available flights based on destination and dates."""
    return json.dumps([
        {"flight_id": "F101", "airline": "Oceanic", "destination": destination, "dates": dates, "price": 450},
        {"flight_id": "F202", "airline": "Global", "destination": destination, "dates": dates, "price": 520}
    ])

@tool
def confirm_price(flight_id: str) -> str:
    """Confirm the real-time price of a specific flight."""
    return f"The price for {flight_id} is confirmed at $450."

@tool
def assemble_passenger_details(user_id: str) -> str:
    """Retrieve and assemble passenger details for booking."""
    return f"Passenger details for user {user_id} have been assembled: John Doe, Frequent Flyer #12345."

@tool
def update_preferences(preferences: str) -> str:
    """Update user travel preferences."""
    return "User preferences updated successfully."

@tool
def submit_booking(flight_id: str, user_id: str) -> str:
    """Submit a flight booking for a user. Requires human confirmation first."""
    return f"Booking {flight_id} for user {user_id} has been submitted successfully."

@tool
def query_companion_profiles(user_id: str) -> str:
    """Retrieve all companion profiles linked to the user that have granted data sharing consent."""
    # In a real app, this would query the personalization DB.
    # For now, returning a mock response simulating the DB query.
    return json.dumps([
        {"companion_id": "C001", "name": "Alice", "role": "business", "base_preferences": {"seat": "window", "meal": "vegetarian"}}
    ])

@tool
def create_companion_profile(user_id: str, name: str, role: str, preferences: str, consent_granted: bool) -> str:
    """Create a new companion profile and link it to the primary user. preferences should be a JSON string dictionary."""
    return f"Companion {name} created with role {role}. Consent granted: {consent_granted}."

@tool
def merge_itinerary_preferences(user_id: str, companion_ids: str, itinerary_overrides: str) -> str:
    """Merge preferences for the primary user and companions, applying any specific itinerary overrides.
    companion_ids: JSON string list of companion IDs.
    itinerary_overrides: JSON string dictionary of preferences specific to this trip.
    """
    return f"Merged preferences for itinerary including companions {companion_ids} with overrides: {itinerary_overrides}. Use this merged vector for the current search."

safe_tools = [search_flights, confirm_price, assemble_passenger_details, update_preferences, query_companion_profiles, create_companion_profile, merge_itinerary_preferences]
sensitive_tools = [submit_booking]

# Configure LLM (Supports Open Source models via OpenAI compatible endpoints)
llm_base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
llm_api_key = os.getenv("OPENAI_API_KEY", "dummy-key-for-local")
llm_model = os.getenv("LLM_MODEL", "gpt-3.5-turbo")

base_llm = ChatOpenAI(
    model=llm_model,
    base_url=llm_base_url,
    api_key=llm_api_key,
    temperature=0
)

def call_model(state: AgentState):
    messages = state["messages"]
    system_prompt = f"""You are an expert AI travel agent. You help users plan and book travel.
You have access to tools for searching flights, confirming prices, assembling details, and booking.

# Instructions
- Always use tools when appropriate to fetch real-time data or perform actions.
- Ground your recommendations in the user's explicit preferences and past interactions provided in the context.
- Before invoking the submit_booking tool, explain the final details to the user and request confirmation.
- Use Chain-of-Thought reasoning: always think step-by-step about what information you have, what you need, and what tool to call next.
- Use the itinerary graph tools (add_itinerary_item, add_itinerary_dependency, view_itinerary_graph) to model cross-service dependencies like flight arrivals and hotel check-ins. If you notice a constraint violation, proactively inform the user and suggest optimizations.

# Few-Shot Examples
User: "I want to go to Paris next week."
Thought: The user wants to travel to Paris next week. I need exact dates to search for flights.
Agent: "I can help with that! Could you please provide the exact dates you plan to travel to Paris?"

User: "Book the flight F101 for me."
Thought: The user wants to book F101. I must confirm the price and assemble passenger details before submitting the booking.
Agent: Let me check the details.
Tool Call: confirm_price(flight_id="F101")
Tool Call: assemble_passenger_details(user_id=...)

# Context
User ID: {state.get("user_id")}
Context from User Profile / Past Interactions: {state.get("context")}
"""
    full_messages = [SystemMessage(content=system_prompt)] + messages
    
    current_all_tools = safe_tools + sensitive_tools + itinerary_tools + plugin_registry.get_dynamic_tools()
    llm = base_llm.bind_tools(current_all_tools)
    
    response = llm.invoke(full_messages)
    return {"messages": [response]}

def execute_safe_tools(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    results = []
    
    all_safe_tools = safe_tools + itinerary_tools + plugin_registry.get_dynamic_tools()
    tool_map = {t.name: t for t in all_safe_tools}
    
    for tc in last_message.tool_calls:
        tool = tool_map.get(tc["name"])
        if tool:
            try:
                res = tool.invoke(tc["args"])
            except Exception as e:
                res = f"Error executing tool: {e}"
            results.append(ToolMessage(content=str(res), tool_call_id=tc["id"], name=tc["name"]))
        else:
            results.append(ToolMessage(content="Tool not found.", tool_call_id=tc["id"], name=tc["name"]))
    return {"messages": results}

def execute_sensitive_tools(state: AgentState):
    messages = state["messages"]
    last_message = messages[-1]
    results = []
    
    tool_map = {t.name: t for t in sensitive_tools}
    
    for tc in last_message.tool_calls:
        tool = tool_map.get(tc["name"])
        if tool:
            try:
                res = tool.invoke(tc["args"])
            except Exception as e:
                res = f"Error executing tool: {e}"
            results.append(ToolMessage(content=str(res), tool_call_id=tc["id"], name=tc["name"]))
        else:
            results.append(ToolMessage(content="Tool not found.", tool_call_id=tc["id"], name=tc["name"]))
    return {"messages": results}

def route_tools(state: AgentState) -> Literal["safe_tools", "sensitive_tools", END]:
    messages = state["messages"]
    last_message = messages[-1]
    if not last_message.tool_calls:
        return END
    
    for tc in last_message.tool_calls:
        if tc["name"] == "submit_booking":
            return "sensitive_tools"
    return "safe_tools"

workflow = StateGraph(AgentState)

workflow.add_node("agent", call_model)
workflow.add_node("safe_tools", execute_safe_tools)
workflow.add_node("sensitive_tools", execute_sensitive_tools)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges("agent", route_tools)
workflow.add_edge("safe_tools", "agent")
workflow.add_edge("sensitive_tools", "agent")

redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
pool = redis.ConnectionPool.from_url(redis_url)
redis_conn = redis.Redis(connection_pool=pool)
memory = RedisSaver(redis_conn)

# Compile the graph with a human-in-the-loop interruption before sensitive tools
app_graph = workflow.compile(
    checkpointer=memory,
    interrupt_before=["sensitive_tools"]
)
