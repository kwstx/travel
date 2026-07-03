import os
import json
from typing import TypedDict, Annotated, Literal
from langchain_core.messages import BaseMessage, SystemMessage
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
from langchain_openai import ChatOpenAI
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver

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

safe_tools = [search_flights, confirm_price, assemble_passenger_details, update_preferences]
sensitive_tools = [submit_booking]

safe_tool_node = ToolNode(safe_tools)
sensitive_tool_node = ToolNode(sensitive_tools)

# Configure LLM (Supports Open Source models via OpenAI compatible endpoints)
llm_base_url = os.getenv("OPENAI_API_BASE", "https://api.openai.com/v1")
llm_api_key = os.getenv("OPENAI_API_KEY", "dummy-key-for-local")
llm_model = os.getenv("LLM_MODEL", "gpt-3.5-turbo")

llm = ChatOpenAI(
    model=llm_model,
    base_url=llm_base_url,
    api_key=llm_api_key,
    temperature=0
).bind_tools(safe_tools + sensitive_tools)

def call_model(state: AgentState):
    messages = state["messages"]
    system_prompt = f"""You are an AI travel agent. You help users plan and book travel.
You have access to tools for searching flights, confirming prices, assembling details, and booking.
Always use tools when appropriate. Before invoking the submit_booking tool, explain the final details to the user.
User ID: {state.get("user_id")}
Context from User Profile: {state.get("context")}
"""
    full_messages = [SystemMessage(content=system_prompt)] + messages
    response = llm.invoke(full_messages)
    return {"messages": [response]}

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
workflow.add_node("safe_tools", safe_tool_node)
workflow.add_node("sensitive_tools", sensitive_tool_node)

workflow.add_edge(START, "agent")
workflow.add_conditional_edges("agent", route_tools)
workflow.add_edge("safe_tools", "agent")
workflow.add_edge("sensitive_tools", "agent")

memory = MemorySaver()

# Compile the graph with a human-in-the-loop interruption before sensitive tools
app_graph = workflow.compile(
    checkpointer=memory,
    interrupt_before=["sensitive_tools"]
)
