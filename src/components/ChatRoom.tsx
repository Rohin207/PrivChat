
import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { 
  MessageSquare, 
  ArrowLeft, 
  Send, 
  User, 
  Users, 
  Trash2 
} from "lucide-react";
import { useRoom, Message as MessageType } from "@/contexts/RoomContext";
import { useUser } from "@/contexts/UserContext";
import { 
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { encryptMessage, decryptMessage } from "@/utils/crypto";
import ThemeSwitcher from "./ThemeSwitcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";

// ChatMessage component
const ChatMessage = ({ message, encryptionKey }: { message: MessageType, encryptionKey?: string }) => {
  const userId = sessionStorage.getItem('userId');
  const isCurrentUser = message.senderId === userId;
  const isSystem = message.senderId === 'system' || message.isSystemMessage;
  
  // Decrypt the message if it's encrypted and we have the key
  const content = message.isEncrypted && encryptionKey 
    ? decryptMessage(message.content, encryptionKey) 
    : message.content;
  
  if (isSystem) {
    return (
      <div className="flex justify-center my-2">
        <div className="bg-muted/50 rounded-full px-4 py-1 text-xs text-muted-foreground">
          {content}
        </div>
      </div>
    );
  }
  
  return (
    <div className={`flex ${isCurrentUser ? 'justify-end' : 'justify-start'} mb-4`}>
      <div className={`max-w-[75%] ${isCurrentUser ? 'bg-primary text-primary-foreground' : 'glass'} rounded-lg p-3 shadow`}>
        <div className="text-xs mb-1 font-medium">{message.senderName}</div>
        <div className="break-words">{content}</div>
        <div className="text-xs mt-1 opacity-70">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
};

const ChatRoom = () => {
  const { roomId } = useParams<{ roomId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useUser();
  const { 
    currentRoom, 
    leaveRoom, 
    sendMessage, 
    privateChats, 
    activePrivateChat, 
    setActivePrivateChat,
    sendPrivateMessage
  } = useRoom();
  
  const [message, setMessage] = useState("");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showPrivateChat, setShowPrivateChat] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [privateMessage, setPrivateMessage] = useState("");
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [currentRoom?.messages]);
  
  // Focus on message input
  useEffect(() => {
    messageInputRef.current?.focus();
  }, []);
  
  // Check if user and room exist
  useEffect(() => {
    const userId = sessionStorage.getItem('userId');
    
    if (!userId || !user) {
      navigate('/');
      return;
    }
    
    if (!currentRoom && roomId) {
      toast({
        title: "Error",
        description: "Room not found or you're not a participant.",
        variant: "destructive"
      });
      navigate('/');
    }
  }, [currentRoom, navigate, roomId, toast, user]);
  
  const handleSendMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!message.trim() || !currentRoom) return;
    
    // Encrypt the message before sending
    const encryptedContent = currentRoom.encryptionKey 
      ? encryptMessage(message.trim(), currentRoom.encryptionKey)
      : message.trim();
    
    sendMessage(encryptedContent);
    setMessage("");
  };
  
  const handleDeleteRoom = () => {
    if (!currentRoom || !user?.isAdmin) return;
    
    sendMessage("The room has been deleted by the admin", true);
    
    // In a real app, this would delete the room via API
    // For this demo, we just leave the room
    leaveRoom();
    navigate('/');
  };
  
  const handleLeaveRoom = () => {
    leaveRoom();
    navigate('/');
  };
  
  const handlePrivateChat = (userId: string) => {
    setSelectedUser(userId);
    setShowPrivateChat(true);
    setShowParticipants(false);
  };
  
  const handleSendPrivateMessage = (e?: React.FormEvent) => {
    e?.preventDefault();
    
    if (!privateMessage.trim() || !selectedUser) return;
    
    // In a real app, this would be encrypted with a shared key
    sendPrivateMessage(selectedUser, privateMessage);
    setPrivateMessage("");
    setShowPrivateChat(false);
  };

  // If not room or not a participant, show loading
  if (!currentRoom) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-2xl">Loading room...</div>
      </div>
    );
  }

  // Get the active private chat (if any)
  const activeChatData = activePrivateChat 
    ? privateChats.find(chat => chat.id === activePrivateChat)
    : null;

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="p-4 flex items-center justify-between glass border-none shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLeaveRoom}
            className="rounded-full"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">{currentRoom.name}</h1>
            <div className="text-xs text-muted-foreground flex items-center">
              <Users className="h-3 w-3 mr-1" />
              {currentRoom.participants.length} participants
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          <ThemeSwitcher />
          
          {user?.isAdmin && (
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={() => setShowDeleteAlert(true)}
              className="rounded-full text-destructive hover:text-destructive"
            >
              <Trash2 className="h-5 w-5" />
            </Button>
          )}
          
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={() => setShowParticipants(true)}
            className="rounded-full"
          >
            <Users className="h-5 w-5" />
          </Button>
        </div>
      </header>
      
      {/* Chat Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        {activeChatData ? (
          // Private Chat
          <div className="flex flex-col h-full">
            <div className="bg-accent/20 rounded-lg p-2 mb-4 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <User className="h-4 w-4" />
                <span className="text-sm">
                  {activeChatData.participants[0] === user?.id 
                    ? currentRoom.participants.find(p => p.id === activeChatData.participants[1])?.name 
                    : currentRoom.participants.find(p => p.id === activeChatData.participants[0])?.name}
                </span>
              </div>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setActivePrivateChat(null)} 
                className="text-xs"
              >
                Back to Room
              </Button>
            </div>
            
            <div className="flex-1 overflow-y-auto">
              {activeChatData.messages.map(message => (
                <ChatMessage 
                  key={message.id} 
                  message={message} 
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
            
            <form onSubmit={handleSendPrivateMessage} className="mt-4 flex space-x-2">
              <Input 
                value={privateMessage} 
                onChange={(e) => setPrivateMessage(e.target.value)} 
                placeholder="Type a private message..." 
                className="flex-1"
                ref={messageInputRef}
              />
              <Button 
                type="submit" 
                size="icon" 
                disabled={!privateMessage.trim()}
              >
                <Send className="h-5 w-5" />
              </Button>
            </form>
          </div>
        ) : (
          // Room Chat
          <div>
            {currentRoom.messages.map(message => (
              <ChatMessage 
                key={message.id} 
                message={message} 
                encryptionKey={currentRoom.encryptionKey}
              />
            ))}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>
      
      {/* Message Input */}
      {!activeChatData && (
        <form onSubmit={handleSendMessage} className="p-4 border-t bg-background flex space-x-2">
          <Input 
            value={message} 
            onChange={(e) => setMessage(e.target.value)} 
            placeholder="Type a message..." 
            className="flex-1"
            ref={messageInputRef}
          />
          <Button 
            type="submit" 
            size="icon" 
            disabled={!message.trim()}
          >
            <Send className="h-5 w-5" />
          </Button>
        </form>
      )}
      
      {/* Delete Room Alert Dialog */}
      <AlertDialog open={showDeleteAlert} onOpenChange={setShowDeleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the room and all messages for everyone. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction 
              onClick={handleDeleteRoom}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      
      {/* Participants Dialog */}
      <Dialog open={showParticipants} onOpenChange={setShowParticipants}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Room Participants</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-64">
            <div className="space-y-2">
              {currentRoom.participants.map(participant => (
                <div 
                  key={participant.id}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <div className="bg-primary/20 p-2 rounded-full">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <div className="font-medium">{participant.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {participant.isAdmin ? 'Admin' : 'Participant'}
                      </div>
                    </div>
                  </div>
                  
                  {participant.id !== user?.id && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => handlePrivateChat(participant.id)}
                      className="space-x-1"
                    >
                      <MessageSquare className="h-4 w-4" />
                      <span>Chat</span>
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
      
      {/* Private Chat Dialog */}
      <Dialog open={showPrivateChat} onOpenChange={setShowPrivateChat}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Private Chat with {selectedUser && currentRoom.participants.find(p => p.id === selectedUser)?.name}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSendPrivateMessage} className="space-y-4">
            <Input 
              value={privateMessage} 
              onChange={(e) => setPrivateMessage(e.target.value)} 
              placeholder="Type a message..." 
              autoFocus
            />
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowPrivateChat(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={!privateMessage.trim()}>
                Send Message
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ChatRoom;
