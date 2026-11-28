import { useId } from 'react';
import './sidebar-icons.css';

const books = <><path fill="#936044" d="M6 21l17-4 18 4v8l-18 4-17-4z"/><path fill="#f4dbae" d="M8 23l15 3v5L8 28z"/><path fill="#45877b" d="M5 14l17-4 18 4v8l-18 4-17-4z"/><path fill="#e7e4ba" d="M7 16l15 3v5L7 21z"/><path fill="#a34537" d="M9 7l17-4 15 4v8l-15 4-17-4z"/><path fill="#fae0ad" d="M11 9l15 3v5l-15-3z"/></>;
const clock = <><circle cx="23" cy="20" r="16" fill="#796242"/><circle cx="23" cy="20" r="13" fill="#f8e8b8" stroke="#c8a65e" strokeWidth="2"/><path d="M23 10v10l6 4M23 7v2m0 22v2M10 20h2m22 0h2" stroke="#493d32" strokeWidth="2" strokeLinecap="round" fill="none"/></>;
const calendar = <><path fill="#925033" d="M10 8l-6 25 30 1-5-21z"/><rect x="11" y="9" width="27" height="24" rx="3" fill="#f8e5bd"/><path fill="#c26049" d="M11 9h27v7H11z"/><path d="M17 7v5m14-5v5m-14 9h14m-14 5h14" stroke="#69483c" strokeWidth="1.4" strokeLinecap="round"/><circle cx="34" cy="27" r="8" fill="#367b58"/><path d="M30 27l3 3 5-6" stroke="white" strokeWidth="2" fill="none" strokeLinecap="round"/></>;
const clipboard = <><rect x="10" y="6" width="26" height="30" rx="3" fill="#9d6b46"/><rect x="13" y="9" width="20" height="24" rx="1" fill="#fff5db"/><rect x="18" y="4" width="10" height="7" rx="3" fill="#5f7181"/><path d="M17 16h12m-12 5h12m-12 5h8" stroke="#7590a8" strokeWidth="1.5"/><path d="M26 30l11-14 3 2-11 14-4 2z" fill="#326393"/></>;
const people = <>{[[13, '#667f7c'], [32, '#8d6b45'], [23, '#2f5279']].map(([x, coat]) => <g key={x} transform={`translate(${x} 0)`}><circle cy="10" r="4" fill="#e9bd91"/><path d="M-5 33l1-12-2 5-2-2 3-9q5-3 10 0l3 9-2 2-2-5 1 12H2L0 24l-2 9z" fill={coat}/><path d="M-2 14l2 7 2-7" fill="#fff5df"/></g>)}</>;

function artwork(icon, gold) {
  switch (icon) {
    case 'speedometer2': return <><circle cx="23" cy="20" r="16" fill="#40566a" stroke="#a6b2b8" strokeWidth="2"/><circle cx="23" cy="20" r="12.5" fill="#f2efdb"/><path d="M13 24a11 11 0 0 1 5-13" stroke="#368664" strokeWidth="3" fill="none"/><path d="M18 11a11 11 0 0 1 10 0" stroke="#d79a23" strokeWidth="3" fill="none"/><path d="M28 11a11 11 0 0 1 5 13" stroke="#b8493f" strokeWidth="3" fill="none"/><path d="M23 22l6-8" stroke="#263c42" strokeWidth="2.2" strokeLinecap="round"/><circle cx="23" cy="22" r="2.5" fill="#263c42"/></>;
    case 'collection': return books;
    case 'mortarboard': return <><path d="M7 26l27-5 7 4v9L7 36z" fill="#986049"/><path d="M8 27l21-4v7L8 33z" fill="#f1d4a6"/><path d="M14 16v7q9 8 18 0v-7z" fill="#263348"/><path d="M5 15l18-9 18 9-18 8z" fill="#3e5068"/><path d="M23 14l14 3v8" fill="none" stroke="#d4a14e" strokeWidth="2"/></>;
    case 'trophy': return <><path d="M15 9H8q-2 10 10 14m13-14h7q2 10-10 14" stroke="#9a6b26" strokeWidth="3" fill="none"/><path d="M13 6h20q0 15-8 18v6h5v4H16v-4h5v-6Q13 21 13 6z" fill={gold}/><rect x="13" y="33" width="20" height="4" rx="1" fill="#443634"/><path d="M11 15l-5 15 3-2 2 3 5-12m19-4 5 15-3-2-2 3-5-12" fill="#ad453d"/></>;
    case 'cash-stack':
    case 'clock-history': return clock;
    case 'calendar-check': return calendar;
    case 'calendar-week': return <><rect x="9" y="7" width="28" height="28" rx="3" fill="#a1714f"/><rect x="11" y="9" width="24" height="24" fill="#fff7e2"/><path d="M19 9v24m8-24v24M11 17h24m-24 8h24" stroke="#a89991" strokeWidth="1"/><path d="M13 12h4m4 8h4m4 8h4" stroke="#3b876b" strokeWidth="2"/><path d="M15 5v7m16-7v7" stroke="#aa4e65" strokeWidth="2"/></>;
    case 'shield-lock': return <><path d="M23 4l15 6v10q0 9-15 17Q8 29 8 20V10z" fill={gold}/><path d="M23 8l11 5v7q0 7-11 13-11-6-11-13v-7z" fill="#2f506c"/><path d="M19 20v-3a4 4 0 0 1 8 0v3" stroke="#e9bc5f" strokeWidth="2" fill="none"/><rect x="17" y="19" width="12" height="8" rx="2" fill="#efc266"/></>;
    case 'diagram-3': return <><path d="M11 9l24 22M35 9L11 31m12-18v14M11 9h24v22H11z" stroke="#52696b" strokeWidth="1.6" fill="none"/>{[[8,6,'#bf8958'],[32,6,'#bb7969'],[8,28,'#74a18f'],[32,28,'#b68d55'],[20,17,'#627da2']].map(([x,y,fill])=><rect key={x+':'+y} x={x} y={y} width="7" height="7" rx="1" fill={fill}/>)}</>;
    case 'people': return people;
    case 'person-lines-fill': return clipboard;
    case 'journal-text': return <><rect x="10" y="8" width="26" height="28" rx="4" fill="#814499"/><rect x="16" y="5" width="14" height="8" rx="3" fill="#a968b9"/><path d="M19 19h11m-11 6h11m-11 6h8" stroke="#fff4ff" strokeWidth="1.8" strokeLinecap="round"/><path d="M15 19h.1m-.1 6h.1m-.1 6h.1" stroke="#ffdcff" strokeWidth="2" strokeLinecap="round"/></>;
    case 'receipt': return clipboard;
    case 'cash-coin': return <><rect x="5" y="11" width="30" height="19" rx="3" fill="#387c67"/><rect x="8" y="14" width="24" height="13" rx="2" fill="#b5dfad"/><circle cx="20" cy="20" r="4" fill="#387c67"/><circle cx="33" cy="27" r="9" fill={gold} stroke="#8e6028" strokeWidth="1.5"/></>;
    default: return <><rect x="7" y="11" width="31" height="23" rx="5" fill="#8a513c"/><rect x="24" y="18" width="17" height="10" rx="3" fill="#bf8358"/><circle cx="30" cy="23" r="2" fill="#f9d783"/></>;
  }
}

export default function SidebarIcon({ icon }) {
  const id = useId();
  return <svg className="hg-sidebar-icon" viewBox="0 0 46 40" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x2="0" y2="1">
      <stop stopColor="#fff0a6"/><stop offset=".5" stopColor="#dca951"/><stop offset="1" stopColor="#97601f"/>
    </linearGradient></defs>
    <ellipse cx="23" cy="37" rx="15" ry="2" fill="#132132" opacity=".18"/>
    {artwork(icon, `url(#${id})`)}
  </svg>;
}
