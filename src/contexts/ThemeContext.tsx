
import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'classic' | 'romantic' | 'hacker';
type TimeOfDay = 'day' | 'night';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  timeOfDay: TimeOfDay;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};

interface ThemeProviderProps {
  children: ReactNode;
}

export const ThemeProvider = ({ children }: ThemeProviderProps) => {
  const [theme, setTheme] = useState<Theme>(() => {
    // Try to get the theme from localStorage
    const savedTheme = localStorage.getItem('chat-theme');
    return (savedTheme as Theme) || 'classic';
  });
  
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay>('day');

  useEffect(() => {
    // Determine if it's day or night
    const updateTimeOfDay = () => {
      const currentHour = new Date().getHours();
      setTimeOfDay(currentHour >= 6 && currentHour < 18 ? 'day' : 'night');
    };
    
    // Set initial time of day
    updateTimeOfDay();
    
    // Update time of day every hour
    const interval = setInterval(updateTimeOfDay, 60 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Save theme to localStorage
    localStorage.setItem('chat-theme', theme);
    
    // Remove all theme classes first
    document.documentElement.classList.remove('classic-theme', 'romantic-theme', 'hacker-theme', 'day-time', 'night-time');
    
    // Add the current theme class
    if (theme !== 'classic') {
      document.documentElement.classList.add(`${theme}-theme`);
    }
    
    // Add time of day class
    document.documentElement.classList.add(`${timeOfDay}-time`);
  }, [theme, timeOfDay]);

  const value = {
    theme,
    setTheme,
    timeOfDay,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
