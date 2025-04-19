### claude_desktop_config.json

```
{
  "globalShortcut": "Alt+Space",
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": [
        "-y",
        "@modelcontextprotocol/server-filesystem",
        "/Users/gimminjae"
      ]
    },
    "google-calendar": {
      "command": "bash",
      "args": [
        "-c",
        "cd /Users/gimminjae/mcp/mcp-google-calendar && node index.js"
      ]
    }
  }
}
```