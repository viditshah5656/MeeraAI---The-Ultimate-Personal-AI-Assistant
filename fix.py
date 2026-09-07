with open("Meera.py", "r") as f:
    lines = f.readlines()

start_idx = -1
for i, line in enumerate(lines):
    if "async def _chat_openai_compatible(" in line:
        start_idx = i
        break

end_idx = -1
for i in range(start_idx, len(lines)):
    if "async def _stream_openai_compatible" in line:
        pass
    if "async for line in resp.aiter_lines():" in lines[i]:
        end_idx = i - 1
        break

new_func = """    async def _chat_openai_compatible(self, info, model, messages, params,
                                       tools, tool_choice, stream, provider_id):
        client = self._get_client(provider_id)
        headers = self._build_headers(provider_id, info)
        base_url = info.get("base_url", "").rstrip("/")
        ep = info.get("chat_endpoint", "")
        url = base_url if base_url.endswith(ep) else f"{base_url}{ep}"

        body: dict = {
            "model": model,
            "messages": messages,
            "stream": stream,
        }
        for p in ["temperature", "top_p", "max_tokens", "frequency_penalty",
                   "presence_penalty", "stop", "seed"]:
            if p in params and params[p] is not None:
                body[p] = params[p]
        if "top_k" in params:
            body["top_k"] = params["top_k"]
        if "repetition_penalty" in params:
            body["repetition_penalty"] = params["repetition_penalty"]
        if tools:
            body["tools"] = tools
        if tool_choice:
            body["tool_choice"] = tool_choice

        if "stop" in body and isinstance(body["stop"], list) and len(body["stop"]) > 4:
            body["stop"] = body["stop"][:4]

        if stream:
            return self._stream_openai_compatible(client, url, headers, body)
        else:
            resp = await client.post(url, headers=headers, json=body, timeout=1800)
            resp.raise_for_status()
            return resp.json()

    async def _stream_openai_compatible(self, client, url, headers, body):
        async with client.stream("POST", url, headers=headers, json=body, timeout=1800) as resp:
"""

lines = lines[:start_idx] + [new_func] + lines[end_idx+1:]
with open("Meera.py", "w") as f:
    f.writelines(lines)
