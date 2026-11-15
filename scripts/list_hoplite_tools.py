import urllib.request
import json

url = "https://api.hoplite.sh/mcp"
token = "hop_svc_b9KMheDsj6qk8TjoLQZ-E0tjLz3ZUi4i4aNCKKHQhRjyc344SoQO2Ezz9UnYINcQ"

headers = {
    "Authorization": f"Bearer {token}",
    "Content-Type": "application/json",
    "Accept": "application/json, text/event-stream"
}

payload = {
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/list",
    "params": {}
}
req = urllib.request.Request(url, data=json.dumps(payload).encode('utf-8'), headers=headers)
with urllib.request.urlopen(req) as resp:
    res = json.loads(resp.read().decode('utf-8'))

for t in res.get("result", {}).get("tools", []):
    print(t["name"], "-", t.get("description", "")[:80])
