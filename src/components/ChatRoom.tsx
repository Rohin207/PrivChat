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
  Trash2,
  Key,
  UserCheck,
  UserX,
  Bell 
} from "lucide-react";
import { useRoom, Message as MessageType, JoinRequest } from "@/contexts/RoomContext";
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
import { encryptMessage, decryptMessage, promptForEncryptionKey, saveRoomEncryptionKey } from "@/utils/crypto";
import ThemeSwitcher from "./ThemeSwitcher";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useIsMobile } from "@/hooks/use-mobile";
import { Badge } from "./ui/badge";

// ChatMessage component
const ChatMessage = ({ message, encryptionKey }: { message: MessageType, encryptionKey?: string }) => {
  const userId = sessionStorage.getItem('userId');
  const isCurrentUser = message.senderId === userId;
  const isSystem = message.senderId === 'system' || message.isSystemMessage;
  const { toast } = useToast();
  
  // Decrypt the message if it's encrypted and we have the key
  let content = message.content;
  
  // Only try to decrypt if the message is encrypted and we have an encryption key
  if (message.isEncrypted && encryptionKey) {
    try {
      content = decryptMessage(message.content, encryptionKey);
    } catch (error) {
      console.error("Failed to decrypt message:", error);
      content = "⚠️ [Encrypted message - unable to decrypt]";
    }
  } else if (message.isEncrypted && !encryptionKey) {
    content = "🔒 [Encrypted message - encryption key required]";
  }
  
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
        <div className={`
          text-xs mb-1 font-medium 
          ${isCurrentUser 
            ? 'text-primary-foreground/70' 
            : 'text-primary font-semibold bg-accent/20 rounded-md px-2 py-0.5'
          }
        `}>
          {message.senderName}
        </div>
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
  const isMobile = useIsMobile();
  const { 
    currentRoom, 
    setCurrentRoom,
    leaveRoom, 
    sendMessage, 
    privateChats, 
    activePrivateChat, 
    setActivePrivateChat,
    sendPrivateMessage,
    fetchJoinRequests,
    approveJoinRequest,
    rejectJoinRequest
  } = useRoom();
  
  const [message, setMessage] = useState("");
  const [showDeleteAlert, setShowDeleteAlert] = useState(false);
  const [showLeaveAlert, setShowLeaveAlert] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);
  const [showPrivateChat, setShowPrivateChat] = useState(false);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [privateMessage, setPrivateMessage] = useState("");
  const [showCredentials, setShowCredentials] = useState(false);
  const [showJoinRequests, setShowJoinRequests] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messageInputRef = useRef<HTMLInputElement>(null);
  
  // Handle window/tab close to leave room
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (currentRoom) {
        // No need to show a confirmation dialog here, as browsers standardize this message
        e.preventDefault();
        e.returnValue = '';
        
        // Try to leave room when user is about to leave
        // Note: This might not complete before the page unloads
        leaveRoom();
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [currentRoom, leaveRoom]);
  
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
  
  // Fetch join requests periodically for admin
  useEffect(() => {
    if (!currentRoom || currentRoom.admin !== user?.id) return;
    
    // Fetch join requests initially
    fetchJoinRequests();
    
    // Set up interval to check for join requests
    const interval = setInterval(() => {
      fetchJoinRequests();
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(interval);
  }, [currentRoom, fetchJoinRequests, user?.id]);
  
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
  
  const handleLeaveRoom = async () => {
    await leaveRoom();
    navigate('/');
  };
  
  const handleLeaveRoomWithConfirmation = () => {
    setShowLeaveAlert(true);
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

  const handleApproveRequest = async (request: JoinRequest) => {
    const success = await approveJoinRequest(request);
    if (success) {
      setShowJoinRequests(false);
    }
  };

  const handleRejectRequest = async (request: JoinRequest) => {
    await rejectJoinRequest(request);
  };

  // Add a new state for the encryption key prompt
  const [showEncryptionPrompt, setShowEncryptionPrompt] = useState(false);
  const [encryptionKeyInput, setEncryptionKeyInput] = useState("");
  
  // Add a new effect to check for encryption key
  useEffect(() => {
    if (!currentRoom) return;
    
    // If room has messages that need encryption key and we don't have one, prompt for it
    const hasEncryptedMessages = currentRoom.messages.some(m => m.isEncrypted);
    const hasEncryptionKey = !!currentRoom.encryptionKey;
    
    if (hasEncryptedMessages && !hasEncryptionKey && !showEncryptionPrompt) {
      setShowEncryptionPrompt(true);
    }
  }, [currentRoom, showEncryptionPrompt]);

  // Fix the encryption key submission handler
  const handleEncryptionKeySubmit = () => {
    if (!encryptionKeyInput.trim() || !currentRoom) return;
    
    // Save the encryption key
    saveRoomEncryptionKey(currentRoom.id, encryptionKeyInput);
    
    // Update the current room state with the encryption key
    setCurrentRoom({
      ...currentRoom,
      encryptionKey: encryptionKeyInput
    });
    
    toast({
      title: "Encryption Key Saved",
      description: "You can now decrypt messages in this room."
    });
    
    setShowEncryptionPrompt(false);
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
    
  const joinRequestCount = currentRoom.joinRequests?.length || 0;

  // Add a new method to copy encryption key to clipboard
  const copyEncryptionKey = async () => {
    if (!currentRoom?.encryptionKey) return;
    
    try {
      await navigator.clipboard.writeText(currentRoom.encryptionKey);
      toast({
        title: "Copied!",
        description: "Encryption key copied to clipboard",
      });
    } catch (err) {
      console.error("Failed to copy encryption key:", err);
    }
  };

  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="p-4 flex items-center justify-between glass border-none shadow-sm z-10">
        <div className="flex items-center space-x-3">
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={handleLeaveRoomWithConfirmation}
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
          {!isMobile && <ThemeSwitcher />}
          
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setShowCredentials(true)}
            className="rounded-full"
          >
            <Key className="h-5 w-5" />
          </Button>

          {user?.isAdmin && joinRequestCount > 0 && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setShowJoinRequests(true)}
              className="rounded-full relative"
            >
              <Bell className="h-5 w-5" />
              <Badge className="absolute -top-1 -right-1 h-5 w-5 flex items-center justify-center p-0">
                {joinRequestCount}
              </Badge>
            </Button>
          )}

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
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
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
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
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

      {/* Room Credentials Dialog */}
      <Dialog open={showCredentials} onOpenChange={setShowCredentials}>
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
          <DialogHeader>
            <DialogTitle>Room Credentials</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Room ID</label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                {currentRoom.id}
              </div>
            </div>
            
            <div className="space-y-2">
              <label className="text-sm font-medium">Room Password</label>
              <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                {currentRoom.password}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-sm font-medium">Encryption Key</label>
                {currentRoom.encryptionKey && (
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="h-8 px-2 text-xs"
                    onClick={copyEncryptionKey}
                  >
                    Copy
                  </Button>
                )}
              </div>
              {currentRoom.encryptionKey ? (
                <div className="p-3 bg-muted rounded-md font-mono text-sm break-all">
                  {currentRoom.encryptionKey}
                </div>
              ) : (
                <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground italic">
                  No encryption key available. You may not be able to read encrypted messages.
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="mt-2 w-full"
                    onClick={() => setShowEncryptionPrompt(true)}
                  >
                    Enter Encryption Key
                  </Button>
                </div>
              )}
              {currentRoom.admin === user?.id && (
                <p className="text-xs text-muted-foreground mt-1">
                  As the admin, share this key with other participants so they can decrypt messages.
                </p>
              )}
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowCredentials(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Encryption Key Dialog */}
      <Dialog open={showEncryptionPrompt} onOpenChange={setShowEncryptionPrompt}>
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
          <DialogHeader>
            <DialogTitle>Enter Encryption Key</DialogTitle>
          </DialogHeader>
          
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              This room contains encrypted messages. Please enter the encryption key provided by the room admin to decrypt them.
            </p>
            
            <Input 
              value={encryptionKeyInput} 
              onChange={(e) => setEncryptionKeyInput(e.target.value)} 
              placeholder="Paste encryption key here" 
              autoFocus
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEncryptionPrompt(false)}>
              Skip
            </Button>
            <Button 
              onClick={handleEncryptionKeySubmit}
              disabled={!encryptionKeyInput.trim()}
            >
              Save Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Join Requests Dialog */}
      <Dialog open={showJoinRequests} onOpenChange={setShowJoinRequests}>
        <DialogContent className={`${isMobile ? 'w-[90vw] max-w-[90vw]' : ''}`}>
          <DialogHeader>
            <DialogTitle>Join Requests</DialogTitle>
          </DialogHeader>
          
          <ScrollArea className="h-64">
            <div className="space-y-4">
              {currentRoom.joinRequests && currentRoom.joinRequests.length > 0 ? (
                currentRoom.joinRequests.map(request => (
                  <div 
                    key={request.id}
                    className="p-4 border rounded-lg"
                  >
                    <div className="flex items-center space-x-2 mb-3">
                      <User className="h-5 w-5" />
                      <span className="font-medium">{request.userName}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mb-3">
                      Requested {new Date(request.timestamp).toLocaleString()}
                    </div>
                    <div className="flex space-x-2">
                      <Button 
                        size="sm" 
                        className="w-full"
                        onClick={() => handleApproveRequest(request)}
                      >
                        <UserCheck className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full"
                        onClick={() => handleRejectRequest(request)}
                      >
                        <UserX className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center text-muted-foreground py-8">
                  No pending join requests
                </div>
              )}
            </div>
          </ScrollArea>
          
          <DialogFooter>
            <Button onClick={() => setShowJoinRequests(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Leave Room Alert Dialog */}
      <AlertDialog open={showLeaveAlert} onOpenChange={setShowLeaveAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Are you sure you want to leave?</AlertDialogTitle>
            <AlertDialogDescription>
              You will be removed from the room. If you are the last person to leave, the room will be deleted permanently.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleLeaveRoom}>
              Leave Room
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default ChatRoom;
