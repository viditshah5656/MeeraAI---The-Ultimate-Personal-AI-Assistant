import os
import glob
import json
import imaplib
import email
from email.header import decode_header
from typing import List, Optional, Dict, Any
from mcp.server.fastmcp import FastMCP
from bs4 import BeautifulSoup
from github import Github
from playwright.async_api import async_playwright
import asyncio
import sys

# Initialize FastMCP Server
mcp = FastMCP("meera-personal")

# --- 1. LOCAL FILESYSTEM MODULE ---
@mcp.tool()
def search_local_files(directory: str, pattern: str) -> str:
    """Search for files in a local directory matching a glob pattern."""
    try:
        if not os.path.exists(directory):
            return f"Error: Directory {directory} does not exist."
        
        search_path = os.path.join(directory, "**", pattern)
        files = glob.glob(search_path, recursive=True)
        
        if not files:
            return f"No files found matching {pattern} in {directory}"
            
        result = "Found files:\n" + "\n".join(files[:100])
        if len(files) > 100:
            result += f"\n...and {len(files)-100} more."
        return result
    except Exception as e:
        return f"Error searching files: {e}"

@mcp.tool()
def read_local_file(filepath: str) -> str:
    """Read the contents of a local file."""
    try:
        if not os.path.exists(filepath):
            return f"Error: File {filepath} does not exist."
        with open(filepath, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {e}"


# --- 2. FREE EMAIL INTEGRATION (IMAP) ---
def _decode_email_str(s, charset):
    if isinstance(s, bytes):
        if charset:
            try:
                return s.decode(charset)
            except:
                return s.decode('utf-8', errors='ignore')
        else:
            return s.decode('utf-8', errors='ignore')
    return str(s)

@mcp.tool()
def list_recent_emails(imap_server: str, email_user: str, email_pass: str, folder: str = "INBOX", limit: int = 10) -> str:
    """Connect to any email account via IMAP and list recent emails completely free."""
    try:
        mail = imaplib.IMAP4_SSL(imap_server)
        mail.login(email_user, email_pass)
        mail.select(folder)
        
        status, messages = mail.search(None, 'ALL')
        if status != "OK":
            return "Failed to search emails."
            
        email_ids = messages[0].split()
        latest_ids = email_ids[-limit:]
        
        results = []
        for e_id in reversed(latest_ids):
            res, msg_data = mail.fetch(e_id, '(RFC822)')
            for response_part in msg_data:
                if isinstance(response_part, tuple):
                    msg = email.message_from_bytes(response_part[1])
                    subject, encoding = decode_header(msg["Subject"])[0]
                    subject = _decode_email_str(subject, encoding)
                    from_ = msg.get("From")
                    date_ = msg.get("Date")
                    results.append(f"ID: {e_id.decode()} | From: {from_} | Date: {date_} | Subject: {subject}")
                    
        mail.logout()
        return "\n".join(results) if results else "No emails found."
    except Exception as e:
        return f"IMAP Error: {e}"

@mcp.tool()
def read_email(imap_server: str, email_user: str, email_pass: str, email_id: str, folder: str = "INBOX") -> str:
    """Read the full content of a specific email using its ID."""
    try:
        mail = imaplib.IMAP4_SSL(imap_server)
        mail.login(email_user, email_pass)
        mail.select(folder)
        
        res, msg_data = mail.fetch(email_id.encode(), '(RFC822)')
        if res != "OK":
            return "Failed to fetch email."
            
        raw_email = msg_data[0][1]
        msg = email.message_from_bytes(raw_email)
        
        body = ""
        if msg.is_multipart():
            for part in msg.walk():
                if part.get_content_type() == "text/plain":
                    try:
                        body = part.get_payload(decode=True).decode()
                        break
                    except:
                        pass
        else:
            try:
                body = msg.get_payload(decode=True).decode()
            except:
                body = str(msg.get_payload())
                
        mail.logout()
        return f"Body:\n{body}"
    except Exception as e:
        return f"IMAP Error: {e}"


# --- 3. FREE BROWSER AUTOMATION (LinkedIn/Canva/Lovable) ---
# We use Playwright to spin up a local headless browser. This bypasses expensive API limits 
# and reads dynamic web apps exactly as a user sees them!
async def _async_scrape(url: str, wait_selector: str = None) -> str:
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        # Using a persistent context could allow keeping login sessions
        ua = None
        if sys.platform == "darwin":
            ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        if ua:
            context = await browser.new_context(user_agent=ua)
        else:
            context = await browser.new_context()
        page = await context.new_page()
        try:
            await page.goto(url, wait_until="domcontentloaded", timeout=30000)
            if wait_selector:
                await page.wait_for_selector(wait_selector, timeout=10000)
            else:
                await asyncio.sleep(3) # allow dynamic JS to load
            
            content = await page.content()
            soup = BeautifulSoup(content, 'html.parser')
            
            # Remove scripts and styles
            for script in soup(["script", "style", "nav", "footer"]):
                script.extract()
            
            text = soup.get_text(separator=' ', strip=True)
            return text
        except Exception as e:
            return f"Scraping Error: {e}"
        finally:
            await browser.close()

@mcp.tool()
async def scrape_dynamic_website(url: str, wait_selector: str = "") -> str:
    """Scrape and read dynamic JS-heavy websites (like public LinkedIn profiles, Lovable pages, Canva public links) perfectly and freely using a local headless browser."""
    try:
        # Await the async playwright scrape directly
        return await _async_scrape(url, wait_selector if wait_selector else None)
    except Exception as e:
        return f"Playwright Error: {e}"


# --- 4. GITHUB INTEGRATION ---
@mcp.tool()
def search_github(token: str, query: str) -> str:
    """Search github repositories using a free Personal Access Token."""
    try:
        ua = None
        if sys.platform == "darwin":
            ua = "Mozilla/5.0 (Macintosh; Intel Mac OS X 13_6) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        g = Github(token, user_agent=ua) if ua else Github(token)
        repos = g.search_repositories(query=query)
        results = []
        for repo in repos[:10]:
            results.append(f"{repo.full_name}: {repo.description} (Stars: {repo.stargazers_count})")
        return "\n".join(results) if results else "No repositories found."
    except Exception as e:
        return f"GitHub Error: {e}"

# --- 5. GOOGLE OAUTH INTEGRATIONS ---
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

@mcp.tool()
def search_gmail_oauth(token: str, query: str = "", max_results: int = 10) -> str:
    """Search your personal Gmail account using an OAuth token."""
    try:
        creds = Credentials(token)
        service = build('gmail', 'v1', credentials=creds)
        results = service.users().messages().list(userId='me', q=query, maxResults=max_results).execute()
        messages = results.get('messages', [])
        
        if not messages:
            return "No messages found."
            
        output = []
        for msg in messages:
            msg_data = service.users().messages().get(userId='me', id=msg['id'], format='metadata', metadataHeaders=['Subject', 'From', 'Date']).execute()
            headers = msg_data.get('payload', {}).get('headers', [])
            subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
            from_ = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
            date_ = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown Date')
            output.append(f"ID: {msg['id']} | From: {from_} | Date: {date_} | Subject: {subject}")
            
        return "\n".join(output)
    except Exception as e:
        return f"Gmail API Error: {e}"

@mcp.tool()
def read_gmail_oauth(token: str, message_id: str) -> str:
    """Read the full content of a specific email using its ID via OAuth token."""
    import base64
    try:
        creds = Credentials(token)
        service = build('gmail', 'v1', credentials=creds)
        msg_data = service.users().messages().get(userId='me', id=message_id, format='full').execute()
        
        payload = msg_data.get('payload', {})
        headers = payload.get('headers', [])
        subject = next((h['value'] for h in headers if h['name'] == 'Subject'), 'No Subject')
        from_ = next((h['value'] for h in headers if h['name'] == 'From'), 'Unknown')
        date_ = next((h['value'] for h in headers if h['name'] == 'Date'), 'Unknown Date')
        
        body = ""
        parts = [payload] if not payload.get('parts') else payload.get('parts')
        
        def get_body(parts):
            body_text = ""
            for part in parts:
                if part.get('mimeType') == 'text/plain':
                    data = part.get('body', {}).get('data')
                    if data:
                        body_text += base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
                elif part.get('parts'):
                    body_text += get_body(part.get('parts'))
            return body_text
        
        if not payload.get('parts'):
            data = payload.get('body', {}).get('data')
            if data:
                body = base64.urlsafe_b64decode(data).decode('utf-8', errors='ignore')
        else:
            body = get_body(parts)
            
        return f"From: {from_}\nDate: {date_}\nSubject: {subject}\n\nBody:\n{body}"
    except Exception as e:
        return f"Gmail API Error: {e}"

@mcp.tool()
def send_gmail_oauth(token: str, to: str, subject: str, body: str, reply_to_message_id: str = "") -> str:
    """Send an email or reply to an email via OAuth token. Provide reply_to_message_id to reply to a specific thread."""
    import base64
    from email.message import EmailMessage
    try:
        creds = Credentials(token)
        service = build('gmail', 'v1', credentials=creds)
        
        message = EmailMessage()
        message.set_content(body)
        message['To'] = to
        message['Subject'] = subject
        
        thread_id = None
        if reply_to_message_id:
            orig_msg = service.users().messages().get(userId='me', id=reply_to_message_id, format='metadata').execute()
            thread_id = orig_msg.get('threadId')
            headers = orig_msg.get('payload', {}).get('headers', [])
            message_id_header = next((h['value'] for h in headers if h['name'].lower() == 'message-id'), None)
            if message_id_header:
                message['In-Reply-To'] = message_id_header
                message['References'] = message_id_header

        encoded_message = base64.urlsafe_b64encode(message.as_bytes()).decode()
        create_message = {'raw': encoded_message}
        if thread_id:
            create_message['threadId'] = thread_id
            
        send_message = service.users().messages().send(userId="me", body=create_message).execute()
        return f"Email sent successfully. Message ID: {send_message.get('id')}"
    except Exception as e:
        return f"Gmail API Error: {e}"

@mcp.tool()
def search_drive_oauth(token: str, query: str = "", max_results: int = 10) -> str:
    """Search your personal Google Drive using an OAuth token. Query examples: "name contains 'meeting'" """
    try:
        creds = Credentials(token)
        service = build('drive', 'v3', credentials=creds)
        # default query if empty
        q = f"name contains '{query}'" if query else ""
        results = service.files().list(q=q, pageSize=max_results, fields="nextPageToken, files(id, name, mimeType, webViewLink)").execute()
        items = results.get('files', [])
        
        if not items:
            return "No files found."
            
        output = []
        for item in items:
            output.append(f"{item['name']} ({item['mimeType']}) - Link: {item.get('webViewLink', 'N/A')}")
            
        return "\n".join(output)
    except Exception as e:
        return f"Google Drive API Error: {e}"

if __name__ == "__main__":
    # Launch the FastMCP server on stdio
    mcp.run()
