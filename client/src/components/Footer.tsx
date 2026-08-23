import React, { useState, useEffect } from 'react';
import { APP_VERSION } from '../config';

interface FooterProps {
  userName?: string;
  location?: string;
  environment?: string;
}

export function Footer({ 
  userName = 'Nicolas El Chami', 
  location = 'France | BLANQUEFORT DEPOT',
  environment = 'Simulator | UAT'
}: FooterProps) {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const formattedDate = time.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  }).replace(/^(\w+)\s(\d+)\s(\w+)\s(\d+)$/, '$1 $2 of $3 $4');

  const formattedTime = time.toLocaleTimeString('en-GB', {
    hour12: false
  });

  return (
    <footer className="h-7 bg-slate-900 text-slate-400 text-[11px] px-4 flex items-center justify-between shrink-0 font-mono border-t border-slate-800">
      <div className="flex items-center gap-2 truncate">
        <span className="text-slate-200 font-medium">{userName}</span>
        <span>|</span>
        <span className="text-indigo-400">v{APP_VERSION}</span>
        <span>|</span>
        <span>{location}</span>
        <span>|</span>
        <span>{environment}</span>
      </div>

      <div className="flex items-center gap-4 shrink-0">
        <div className="text-slate-300 font-medium tracking-wide">
          <span>{formattedDate}</span>
          <span className="mx-1.5 text-slate-600">•</span>
          <span className="text-emerald-400 font-bold">{formattedTime}</span>
        </div>

        <div className="flex items-center gap-1.5 pl-2 border-l border-slate-800">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-slate-300 text-[10px]">Online</span>
        </div>
      </div>
    </footer>
  );
}

export default Footer;