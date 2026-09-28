"""Unit and integration tests for FastAPI and WebSocket daemon gateway."""

from __future__ import annotations

import unittest
from fastapi.testclient import TestClient

from meera_runtime.api import create_app
from meera_runtime.supervisor import Supervisor


class GatewayTests(unittest.TestCase):
    def setUp(self) -> None:
        self.supervisor = Supervisor()
        self.app = create_app(self.supervisor)
        self.client = TestClient(self.app)

    def test_root_dashboard_endpoint(self) -> None:
        response = self.client.get("/")
        self.assertEqual(response.status_code, 200)
        self.assertIn("<title>MeeraAI Control Console</title>", response.text)

    def test_favicon_endpoint(self) -> None:
        response = self.client.get("/favicon.ico")
        self.assertEqual(response.status_code, 204)

    def test_health_endpoint(self) -> None:
        response = self.client.get("/health")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "ok")

    def test_cors_accepts_loopback_and_rejects_remote_websites(self) -> None:
        local = self.client.options(
            "/api/v1/status",
            headers={
                "Origin": "http://localhost:4317",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertEqual(local.headers.get("access-control-allow-origin"), "http://localhost:4317")
        remote = self.client.options(
            "/api/v1/status",
            headers={
                "Origin": "https://attacker.example",
                "Access-Control-Request-Method": "GET",
            },
        )
        self.assertNotIn("access-control-allow-origin", remote.headers)

    def test_system_status_endpoint(self) -> None:
        response = self.client.get("/api/v1/status")
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertIn("summary", data)
        self.assertIn("data", data)
        self.assertIn("workers", data["data"])

    def test_memory_crud_endpoints(self) -> None:
        # Create memory
        response = self.client.post("/api/v1/memories", json={"content": "Loves Earl Grey tea."})
        self.assertEqual(response.status_code, 200)

        # List memories
        response = self.client.get("/api/v1/memories")
        self.assertEqual(response.status_code, 200)
        items = response.json()
        self.assertTrue(any(item["content"] == "Loves Earl Grey tea." for item in items))

        # Delete memory
        response = self.client.delete("/api/v1/memories/Loves Earl Grey tea.")
        self.assertEqual(response.status_code, 200)

    def test_settings_endpoints(self) -> None:
        response = self.client.post("/api/v1/settings", json={"settings": {"speech_rate": 1.10}})
        self.assertEqual(response.status_code, 200)

        response = self.client.get("/api/v1/settings")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json().get("speech_rate"), 1.10)

    def test_websocket_connection_and_welcome(self) -> None:
        with self.client.websocket_connect("/ws") as ws:
            packet = ws.receive_json()
            self.assertEqual(packet.get("type"), "welcome")
            self.assertEqual(packet.get("daemon"), "MeeraAI")

    def test_garbage_collect_endpoint(self) -> None:
        response = self.client.post("/api/v1/gc")
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json().get("ok"))

    def test_interact_endpoint(self) -> None:
        response = self.client.post("/api/v1/interact", json={"text": "Hello"})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertTrue(data.get("ok"))
        self.assertTrue(len(data.get("summary", "")) > 0)


if __name__ == "__main__":
    unittest.main()
