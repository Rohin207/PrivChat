
import { useState, useEffect, FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { useNavigate } from "react-router-dom";
import { generateRandomId } from "@/utils/crypto";
import { useUser } from "@/contexts/UserContext";
import { useRoom } from "@/contexts/RoomContext";
import { LoaderCircle, Shield, Key } from "lucide-react";
import ThemeSwitcher from "./ThemeSwitcher";
import { useIsMobile } from "@/hooks/use-mobile";

const HomePage = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const { user, setUser } = useUser();
  const { createRoom, joinRoom, requestToJoinRoom, availableRooms } = useRoom();
  const isMobile = useIsMobile();

  const [tab, setTab] = useState("join");
  const [name, setName] = useState("");
  const [roomName, setRoomName] = useState("");
  const [roomId, setRoomId] = useState("");
  const [roomPassword, setRoomPassword] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  // Load username from sessionStorage if available
  useEffect(() => {
    const savedName = sessionStorage.getItem('userName');
    if (savedName) {
      setName(savedName);
    }
  }, []);

  const handleCreateUser = () => {
    if (name.trim().length < 2) {
      toast({
        title: "Invalid name",
        description: "Please enter a name with at least 2 characters",
        variant: "destructive"
      });
      return null;
    }

    const newUser = {
      id: sessionStorage.getItem('userId') || generateRandomId(),
      name: name.trim(),
      isAdmin: false,
      joinedAt: new Date()
    };

    sessionStorage.setItem('userId', newUser.id);
    sessionStorage.setItem('userName', newUser.name);
    setUser(newUser);

    return newUser;
  };

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    
    const user = handleCreateUser();
    if (!user) return;

    setIsCreating(true);

    try {
      const room = await createRoom(roomName || `${user.name}'s Room`, user.id, user.name);
      
      toast({
        title: "Room created",
        description: `Room created with ID: ${room.id} and password: ${room.password}`,
      });
      
      navigate(`/room/${room.id}`);
    } catch (error) {
      console.error("Failed to create room:", error);
      toast({
        title: "Error",
        description: "Failed to create room. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: FormEvent) => {
    e.preventDefault();
    
    if (!roomId.trim() || !roomPassword.trim()) {
      toast({
        title: "Missing details",
        description: "Please enter room ID and password",
        variant: "destructive",
      });
      return;
    }
    
    const user = handleCreateUser();
    if (!user) return;

    setIsJoining(true);
    
    try {
      const success = await requestToJoinRoom(roomId, roomPassword, user);
      if (success) {
        navigate(`/room/${roomId}`);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to join room. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="container max-w-md mx-auto p-4 h-screen flex flex-col justify-center">
      <Card className="w-full glass">
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-2xl">Secure Chat</CardTitle>
            <CardDescription>Create or join encrypted chat rooms</CardDescription>
          </div>
          <ThemeSwitcher />
        </CardHeader>
        
        <CardContent>
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1" htmlFor="username">
              Your Name
            </label>
            <Input
              id="username"
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={isCreating || isJoining}
            />
          </div>
          
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="join">Join Room</TabsTrigger>
              <TabsTrigger value="create">Create Room</TabsTrigger>
            </TabsList>
            
            <TabsContent value="join" className="mt-4">
              <form onSubmit={handleJoinRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="roomId">
                    Room ID
                  </label>
                  <Input
                    id="roomId"
                    placeholder="Enter room ID"
                    value={roomId}
                    onChange={(e) => setRoomId(e.target.value)}
                    disabled={isJoining}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="password">
                    Room Password
                  </label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="Enter room password"
                    value={roomPassword}
                    onChange={(e) => setRoomPassword(e.target.value)}
                    disabled={isJoining}
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isJoining}
                >
                  {isJoining ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Joining...
                    </>
                  ) : (
                    <>
                      <Key className="mr-2 h-4 w-4" />
                      Join Room
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="create" className="mt-4">
              <form onSubmit={handleCreateRoom} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" htmlFor="roomName">
                    Room Name (Optional)
                  </label>
                  <Input
                    id="roomName"
                    placeholder="Enter room name"
                    value={roomName}
                    onChange={(e) => setRoomName(e.target.value)}
                    disabled={isCreating}
                  />
                </div>
                
                <Button 
                  type="submit" 
                  className="w-full" 
                  disabled={isCreating}
                >
                  {isCreating ? (
                    <>
                      <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                      Creating...
                    </>
                  ) : (
                    <>
                      <Shield className="mr-2 h-4 w-4" />
                      Create Secure Room
                    </>
                  )}
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
        
        {availableRooms.length > 0 && (
          <CardFooter className="flex-col">
            <div className="w-full pt-4 border-t">
              <h3 className="text-sm font-medium mb-2">Available Rooms</h3>
              <div className="space-y-2 max-h-40 overflow-y-auto">
                {availableRooms.map(room => (
                  <div 
                    key={room.id}
                    className="text-xs p-2 bg-accent/20 rounded-md cursor-pointer hover:bg-accent/40 transition-colors"
                    onClick={() => {
                      setRoomId(room.id);
                      setTab('join');
                    }}
                  >
                    {room.name || `Room-${room.id.slice(0, 6)}`}
                  </div>
                ))}
              </div>
            </div>
          </CardFooter>
        )}
      </Card>
      
      <div className="text-center mt-4 text-xs text-muted-foreground">
        End-to-end encrypted messaging
      </div>
    </div>
  );
};

export default HomePage;
