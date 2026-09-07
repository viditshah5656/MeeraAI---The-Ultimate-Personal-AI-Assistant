import re

file_path = "/Users/rockstar/Desktop/MeeraAI---The-Ultimate-Personal-AI-Assistant-main/desktop_frontend/src/App.tsx"

with open(file_path, "r") as f:
    code = f.read()

# Locate the target map block
start_str = "                          visibleMessages.map((message, index) => {"
end_str = "                          })\n                        ) : !hasAnyMessages ? ("

start_idx = code.find(start_str)
end_idx = code.find(end_str)

if start_idx == -1 or end_idx == -1:
    print("Could not find the block to replace!")
    exit(1)

# Extract the body inside map
body_block = code[start_idx + len("                          visibleMessages.map((message, index) => {"):end_idx]

# Remove trailing '                            );' which corresponds to the return statement end
body_block = body_block.rstrip()
if body_block.endswith(");"):
    body_block = body_block[:-2]

# The body currently has a 'return (' inside it, we will just keep it as the render body.
# Let's clean it up slightly and wrap it in our component.

memo_component_code = """
interface MemoizedMessageRowProps {
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
}

const MemoizedMessageRow = React.memo(({
  message,
  previousMessage,
  chatActionFeedback,
  isSending,
  latestMessage,
  liveThinkingText,
  modelLoadStatus,
  currentSession,
  agentInteractionDialog,
  handleUserDataSubmit,
  openAttachmentViewer,
  openImageViewer,
  handleEditMessage,
  handleCopy,
  handleRetryMessage,
  triggerChatActionFeedback,
  openAgentInteraction
}: MemoizedMessageRowProps) => {
""" + body_block + """
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.message === nextProps.message &&
    prevProps.previousMessage === nextProps.previousMessage &&
    prevProps.isSending === nextProps.isSending &&
    prevProps.latestMessage === nextProps.latestMessage &&
    prevProps.liveThinkingText === nextProps.liveThinkingText &&
    prevProps.modelLoadStatus === nextProps.modelLoadStatus &&
    prevProps.currentSession === nextProps.currentSession &&
    prevProps.agentInteractionDialog === nextProps.agentInteractionDialog &&
    prevProps.chatActionFeedback === nextProps.chatActionFeedback
  );
});
"""

# Now what do we replace the block with?
replacement_code = """                          visibleMessages.map((message, index) => (
                            <MemoizedMessageRow
                              key={message.id}
                              message={message}
                              previousMessage={index > 0 ? visibleMessages[index - 1] : null}
                              chatActionFeedback={chatActionFeedback}
                              isSending={isSending}
                              latestMessage={latestMessage}
                              liveThinkingText={liveThinkingText}
                              modelLoadStatus={modelLoadStatus}
                              currentSession={currentSession}
                              agentInteractionDialog={agentInteractionDialog}
                              handleUserDataSubmit={handleUserDataSubmit}
                              openAttachmentViewer={openAttachmentViewer}
                              openImageViewer={openImageViewer}
                              handleEditMessage={handleEditMessage}
                              handleCopy={handleCopy}
                              handleRetryMessage={handleRetryMessage}
                              triggerChatActionFeedback={triggerChatActionFeedback}
                              openAgentInteraction={openAgentInteraction}
                            />
                          ))
                        ) : !hasAnyMessages ? ("""

# Replace the block
new_code = code[:start_idx] + replacement_code + code[end_idx + len(end_str):]

# Now insert memo_component_code right before 'export default function App' or 'function App('
app_func_str = "function App({ onOpenAuth, onCloseAuth }"
app_func_idx = new_code.find(app_func_str)
if app_func_idx == -1:
    print("Could not find App function!")
    exit(1)

new_code = new_code[:app_func_idx] + memo_component_code + "\n\n" + new_code[app_func_idx:]

with open(file_path, "w") as f:
    f.write(new_code)

print("Patch applied successfully.")
