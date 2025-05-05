
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'classic' | 'romantic' | 'hacker';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
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

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  // Fix the useState initialization to avoid dispatcher is null error
  const [theme, setTheme] = useState<Theme>('classic');
  
  // Load the theme from localStorage in a useEffect
  useEffect(() => {
    // Try to get the theme from localStorage
    const savedTheme = localStorage.getItem('chat-theme');
    if (savedTheme && (savedTheme === 'classic' || savedTheme === 'romantic' || savedTheme === 'hacker')) {
      setTheme(savedTheme as Theme);
    }
  }, []);

  useEffect(() => {
    // Save theme to localStorage
    localStorage.setItem('chat-theme', theme);
    
    // Remove all theme classes first
    document.documentElement.classList.remove('classic-theme', 'romantic-theme', 'hacker-theme');
    
    // Add the current theme class
    if (theme !== 'classic') {
      document.documentElement.classList.add(`${theme}-theme`);
    }
  }, [theme]);

  const value = {
    theme,
    setTheme,
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
};
