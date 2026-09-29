import subprocess
import os

from pywinauto import Application
from pywinauto.keyboard import send_keys


def open_app(path: str):

    subprocess.Popen(path)

    return f"Opened {path}"


def run_command(command: str):

    result = subprocess.run(
        command,
        shell=True,
        capture_output=True,
        text=True,
        timeout=30
    )

    return result.stdout or result.stderr


def press_keys(keys: str):

    send_keys(keys)

    return f"Pressed {keys}"


def type_text(text: str):

    send_keys(text, with_spaces=True)

    return "Typed the requested text."


def find_window(title: str):

    app = Application(
        backend="uia"
    ).connect(
        title_re=f".*{title}.*"
    )

    window = app.top_window()

    return window