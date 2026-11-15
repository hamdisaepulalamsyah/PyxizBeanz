import urllib.request
import json

url = "https://api.hoplite.sh/mcp"
token = "hop_svc_b9KMheDsj6qk8TjoLQZ-E0tjLz3ZUi4i4aNCKKHQhRjyc344SoQO2Ezz9UnYINcQ"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

def call_tool(name, arguments={}):
    payload = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "tools/call",
        "params": {
            "name": name,
            "arguments": arguments
        }
    }
    req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode('utf-8'))

threads = call_tool("hoplite_list_threads", {"projectId": "proj_189e20edc21749ddaf198d8cd0c3cf35"})
raw = threads['result']['content'][0]['text']
parsed = json.loads(raw)
for th in parsed.get("threads", []):
    print(f"ID: {th.get('id')} | Title: {th.get('title')} | Status: {th.get('status')} | Updated: {th.get('updatedAt')} | PR: {th.get('pullRequest')}")
