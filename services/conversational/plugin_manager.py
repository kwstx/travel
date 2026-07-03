import requests
import json
from typing import Dict, Any, List
from pydantic import BaseModel, create_model
from langchain_core.tools import StructuredTool

class PluginRegistry:
    def __init__(self):
        # Maps tool_name -> tool metadata
        self.registry: Dict[str, Any] = {}
        # Caches the generated Langchain tools
        self._tools_cache: List[StructuredTool] = []

    def register_tool(self, tool_name: str, tool_description: str, parameters_schema: Dict[str, Any], execute_url: str):
        self.registry[tool_name] = {
            "name": tool_name,
            "description": tool_description,
            "schema": parameters_schema,
            "execute_url": execute_url
        }
        self._rebuild_tools()

    def _rebuild_tools(self):
        tools = []
        for name, meta in self.registry.items():
            # Create a dynamic function to call the microservice
            def execute_tool_factory(execute_url):
                def execute_tool(**kwargs):
                    try:
                        response = requests.post(execute_url, json=kwargs, timeout=10)
                        response.raise_for_status()
                        return response.text
                    except Exception as e:
                        return f"Error executing tool {name}: {str(e)}"
                return execute_tool
            
            # For simplicity, we just use the kwargs directly since StructuredTool can infer from a pydantic model
            # but we need to convert JSON schema to a Pydantic model.
            
            # Simple conversion from json schema to pydantic model (only handles basic types for this demo)
            fields = {}
            for prop_name, prop_meta in meta["schema"].get("properties", {}).items():
                ptype = str
                if prop_meta.get("type") == "integer": ptype = int
                elif prop_meta.get("type") == "boolean": ptype = bool
                elif prop_meta.get("type") == "number": ptype = float
                
                # Assume optional unless in required
                is_req = prop_name in meta["schema"].get("required", [])
                if is_req:
                    fields[prop_name] = (ptype, ...)
                else:
                    fields[prop_name] = (ptype, None)

            DynamicArgs = create_model(f"{name}Args", **fields)
            
            tool = StructuredTool.from_function(
                func=execute_tool_factory(meta["execute_url"]),
                name=meta["name"],
                description=meta["description"],
                args_schema=DynamicArgs
            )
            tools.append(tool)
        self._tools_cache = tools

    def get_dynamic_tools(self) -> List[StructuredTool]:
        return self._tools_cache

plugin_registry = PluginRegistry()
