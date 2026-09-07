import re

file_path = "/Users/rockstar/Desktop/MeeraAI---The-Ultimate-Personal-AI-Assistant-main/desktop_frontend/src/App.tsx"

with open(file_path, "r") as f:
    code = f.read()

# Replace the interface definition with fixed types
old_interface = """interface MemoizedMessageRowProps {
  message: Message;
  previousMessage: Message | null;
  chatActionFeedback: Record<string, boolean>;
  isSending: boolean;
  latestMessage: Message | null;
  liveThinkingText: string;
  modelLoadStatus: any;
  currentSession: any;
  agentInteractionDialog: any;
  handleUserDataSubmit: (key: string, answer: string, messageId: string) => void;
  openAttachmentViewer: (file: any) => void;
  openImageViewer: (url: string) => void;
  handleEditMessage: (content: string) => void;
  handleCopy: (content: string) => void;
  handleRetryMessage: (id: string) => void;
  triggerChatActionFeedback: (id: string, action: string) => void;
  openAgentInteraction: (messageId: string, interaction: any, sessionId?: string) => void;
}"""

new_interface = """interface MemoizedMessageRowProps {
  message: Message;
  previousMessage: Message | null;
  chatActionFeedback: Record<string, boolean>;
  isSending: boolean;
  latestMessage: Message | null;
  liveThinkingText: string;
  modelLoadStatus: any;
  currentSession: any;
  agentInteractionDialog: any;
  handleUserDataSubmit: (key: string, answer: string, messageId?: string) => void;
  openAttachmentViewer: (file: any) => void;
  openImageViewer: (urls: string[], index: number) => void;
  handleEditMessage: (content: string) => void;
  handleCopy: (content: string) => void;
  handleRetryMessage: (id: string) => void;
  triggerChatActionFeedback: (id: string, action: "edit" | "copy" | "retry") => void;
  openAgentInteraction: (messageId: string, interaction: any, sessionId?: string) => void;
}"""

if old_interface in code:
    code = code.replace(old_interface, new_interface)
else:
    print("Could not find old interface to replace")
    exit(1)

with open(file_path, "w") as f:
    f.write(code)

print("Fixed types")
