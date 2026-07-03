import json
from typing import Dict, List, Any
from langchain_core.tools import tool

class ItineraryGraph:
    def __init__(self):
        self.nodes = {}
        self.edges = []

    def add_node(self, node_id: str, node_type: str, details: Dict[str, Any]):
        self.nodes[node_id] = {
            "type": node_type,
            "details": details,
            "status": "pending" # e.g. pending, booked
        }

    def add_dependency(self, from_node: str, to_node: str, relationship: str):
        self.edges.append({
            "from": from_node,
            "to": to_node,
            "relationship": relationship
        })

    def get_graph_state(self) -> str:
        return json.dumps({
            "nodes": self.nodes,
            "edges": self.edges
        }, indent=2)

    def evaluate_constraints(self):
        # A simple constraints evaluation logic
        issues = []
        for edge in self.edges:
            f = self.nodes.get(edge["from"])
            t = self.nodes.get(edge["to"])
            if f and t:
                if f["type"] == "flight" and t["type"] == "hotel":
                    # e.g., flight arrival vs hotel check-in
                    arr_time = f["details"].get("arrival_time")
                    checkin = t["details"].get("checkin_time")
                    # Real app would do datetime comparisons. Here we mock:
                    if arr_time and checkin and arr_time > checkin:
                        issues.append(f"Constraint violated: Flight {edge['from']} arrives at {arr_time} after Hotel {edge['to']} check-in {checkin}")
        return issues

itinerary_graph_instance = ItineraryGraph()

@tool
def add_itinerary_item(node_id: str, node_type: str, details_json: str) -> str:
    """Add a new item (flight, hotel, etc) to the itinerary graph. details_json must be a JSON object string."""
    try:
        details = json.loads(details_json)
        itinerary_graph_instance.add_node(node_id, node_type, details)
        return f"Added node {node_id}."
    except Exception as e:
        return f"Failed to add node: {e}"

@tool
def add_itinerary_dependency(from_node: str, to_node: str, relationship: str) -> str:
    """Add a dependency between two itinerary items (e.g. flight ID to hotel ID)."""
    itinerary_graph_instance.add_dependency(from_node, to_node, relationship)
    return f"Added dependency from {from_node} to {to_node}."

@tool
def view_itinerary_graph() -> str:
    """View the current itinerary graph and any constraint violations."""
    state = itinerary_graph_instance.get_graph_state()
    issues = itinerary_graph_instance.evaluate_constraints()
    issues_text = "\nConstraint Issues: " + ", ".join(issues) if issues else "\nNo constraint issues."
    return state + issues_text

itinerary_tools = [add_itinerary_item, add_itinerary_dependency, view_itinerary_graph]
