"""
Local MCP server exposing CivilAI's live project data to AI tools (Claude Desktop,
Claude Code, etc.) running on this machine.

Every tool below is the exact same function the in-app copilot agent uses
(app.ai.agent_copilot), so results here match what the CivilAI copilot itself
would return — this just makes them reachable from outside the app too.

Run directly:
    venv\\Scripts\\python.exe -m app.mcp.server
"""
import os
import sys
from pathlib import Path

# Make this runnable regardless of the caller's working directory (e.g. when
# launched by Claude Desktop, which doesn't set cwd) by putting backend/ on
# sys.path so `app.*` imports resolve, and chdir'ing there so config.py's
# relative `.env` lookup (Config.env_file = ".env") still finds it.
_BACKEND_DIR = Path(__file__).resolve().parents[2]
if str(_BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(_BACKEND_DIR))
os.chdir(_BACKEND_DIR)

from mcp.server.fastmcp import FastMCP

from app.ai.agent_copilot import _TOOLS

mcp = FastMCP("CivilAI")

for _tool in _TOOLS:
    mcp.add_tool(_tool.func, name=_tool.name, description=_tool.description)

if __name__ == "__main__":
    mcp.run()
