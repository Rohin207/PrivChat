
import { Moon, Sun, Heart } from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { Button } from "@/components/ui/button";

const ThemeSwitcher = () => {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center gap-2">
      <Button
        variant={theme === 'classic' ? "default" : "outline"}
        size="icon"
        onClick={() => setTheme('classic')}
        className={`rounded-full transition-all ${
          theme === 'classic' ? 'bg-primary text-primary-foreground' : ''
        }`}
        title="Classic Theme"
      >
        <Sun className="h-5 w-5" />
      </Button>
      
      <Button
        variant={theme === 'romantic' ? "default" : "outline"}
        size="icon"
        onClick={() => setTheme('romantic')}
        className={`rounded-full transition-all ${
          theme === 'romantic' ? 'bg-primary text-primary-foreground' : ''
        }`}
        title="Romantic Theme"
      >
        <Heart className="h-5 w-5" />
      </Button>
      
      <Button
        variant={theme === 'hacker' ? "default" : "outline"}
        size="icon"
        onClick={() => setTheme('hacker')}
        className={`rounded-full transition-all ${
          theme === 'hacker' ? 'bg-primary text-primary-foreground' : ''
        }`}
        title="Hacker Theme"
      >
        <Moon className="h-5 w-5" />
      </Button>
    </div>
  );
};

export default ThemeSwitcher;
