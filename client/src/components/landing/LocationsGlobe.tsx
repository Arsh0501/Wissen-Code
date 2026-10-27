import { useEffect, useRef, useState } from 'react';
import { MapPin, Pause, Play } from 'lucide-react';
import land from './land-outlines.json';
import './LocationsGlobe.css';

// User-supplied office list. Coordinates approximate each office area at globe scale.
const offices = [
  {
    city: 'Alpharetta',
    country: 'United States',
    lat: 34.09,
    lon: -84.34,
    address: '12505 Broadwell Rd, Alpharetta, GA 30004, United States',
  },
  {
    city: 'Waukesha',
    country: 'United States',
    lat: 43.01,
    lon: -88.23,
    address: '2325 Parklawn Drive Suite K Waukesha, Wisconsin 53186, United States',
  },
  {
    city: 'New York',
    country: 'United States',
    lat: 40.71,
    lon: -74.01,
    address: '25 Broadway, 9th Floor, New York, NY 10004, United States',
  },
  {
    city: 'Plano',
    country: 'United States',
    lat: 33.08,
    lon: -96.82,
    address: '5717, Legacy Dr, Suite 250, Plano, TX 75024, United States',
  },
  {
    city: 'Gurugram',
    country: 'India',
    lat: 28.5,
    lon: 77.09,
    address:
      'Wework, Cyber City, DLF Forum, DLF Tower 10th Rd, Phase III, Gurugram, Haryana 122002',
  },
  {
    city: 'Bengaluru · Whitefield',
    country: 'India',
    lat: 12.98,
    lon: 77.73,
    address:
      '#176, Adarsh Eco Place 4th Floor, KIADB EPIP 2nd Phase Whitefield Bangalore, Karnataka 560066',
  },
  {
    city: 'Bengaluru · Embassy Tech Square',
    country: 'India',
    lat: 12.93,
    lon: 77.69,
    address:
      '1st Floor, Signet, Embassy Tech Square Main Rd, Kaverappa Layout, Kadubeesanahalli, Bengaluru, Karnataka 560103',
  },
  {
    city: 'Mumbai',
    country: 'India',
    lat: 19.11,
    lon: 72.88,
    address:
      '7th Floor, Tower C, Times Square Building, Marol, Andheri-Kurla Road, Andheri (East), Mumbai – 400059, Maharashtra, India.',
  },
  {
    city: 'Pune',
    country: 'India',
    lat: 18.56,
    lon: 73.78,
    address: 'Smartworks M Agile, Level 2 Pan card Club Road, Baner, Pune, Maharashtra, 411045',
  },
  {
    city: 'Hyderabad · Cyber Towers',
    country: 'India',
    lat: 17.45,
    lon: 78.38,
    address: '9th Floor, Q4, Cyber Towers, Hi-Tec City, Madhapur, Hyderabad, Telangana 500081',
  },
  {
    city: 'Hyderabad · Orbit',
    country: 'India',
    lat: 17.43,
    lon: 78.38,
    address:
      '3rd Floor, Orbit by Auro Reality, Sy No 83/1, Plot No 30/C, Knowledge City Rd, Behind My Home Twitza, Panmaktha, Hyderabad, Rai Durg, Telangana 500032',
  },
  {
    city: 'Chennai',
    country: 'India',
    lat: 12.97,
    lon: 80.25,
    address:
      'Awfis OMR,Wissen Technology, I Floor, 111,Rajiv Gandhi Road, Old, Mahabalipuram Road, OMR, Kottivakkam, Chennai, Tamil Nadu 600041',
  },
  {
    city: 'Toronto',
    country: 'Canada',
    lat: 43.65,
    lon: -79.38,
    address: '157 Adelaide St W #338, Toronto, ON M5H 1P9',
  },
  {
    city: 'Montréal',
    country: 'Canada',
    lat: 45.5,
    lon: -73.57,
    address: '2100-1000 rue De La Gauchetière O Montréal (Québec) H3B 4W5',
  },
  {
    city: 'Mexico City',
    country: 'Mexico',
    lat: 19.36,
    lon: -99.27,
    address: '1600 Floor #4 Centre de Cuidad Santa Fe Mexico City, D.F. 01210',
  },
  {
    city: 'Colchester · Stanway',
    country: 'United Kingdom',
    lat: 51.88,
    lon: 0.83,
    address: '10 Pappus House, Tollgate Business park, Stanway, Colchester CO3 8AQ, United Kingdom',
  },
  {
    city: 'Sydney · Darling Point',
    country: 'Australia',
    lat: -33.87,
    lon: 151.24,
    address: 'Wissen Australia Pty Ltd, 19/105A Darling Point Road, DARLING POINT NSW 2027',
  },
  {
    city: 'Ho Chi Minh City',
    country: 'Vietnam',
    lat: 10.78,
    lon: 106.71,
    address:
      'Marshal Global, Level 21, S-30, Vietcom bank Tower, 5 Me Linh Square, District 1, Ho Chi Minh City',
  },
];

export default function LocationsGlobe({ compact = false }: { compact?: boolean }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const motionTime = useRef(0);
  const angle = useRef((-offices[0].lon * Math.PI) / 180);
  const [selected, setSelected] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  );
  const focus = useRef<number | null>(null);
  const office = offices[selected];

  useEffect(() => {
    if (!window.matchMedia) return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setReduced(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext('2d');
    if (!ctx) return;
    let frame = 0,
      previous = 0,
      visible = true;
    let width = 600;
    const resize = new ResizeObserver(([entry]) => {
      width = entry.contentRect.width;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      el.width = Math.round(width * ratio);
      el.height = Math.round(width * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    });
    resize.observe(el);
    const observer = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
    });
    observer.observe(el);
    function draw(now: number) {
      if (!ctx) return;
      const delta = previous ? Math.min(now - previous, 50) : 0;
      previous = now;
      if (visible && !document.hidden) {
        if (focus.current !== null) {
          let difference = (focus.current - angle.current) % (Math.PI * 2);
          if (difference > Math.PI) difference -= Math.PI * 2;
          if (difference < -Math.PI) difference += Math.PI * 2;
          angle.current += reduced ? difference : difference * 0.065;
          if (Math.abs(difference) < 0.003) focus.current = null;
        } else if (!paused && !reduced)
          angle.current = (angle.current + delta * ((Math.PI * 2) / 40000)) % (Math.PI * 2);
        if (!paused && !reduced) motionTime.current += delta;
        const time = motionTime.current;
        const center = width / 2,
          radius = width * (compact ? 0.48 : 0.385);
        ctx.clearRect(0, 0, width, width);
        const project = (lon: number, lat: number) => {
          const a = (lon * Math.PI) / 180 + angle.current,
            b = (lat * Math.PI) / 180;
          const x = Math.cos(b) * Math.sin(a),
            y = Math.sin(b),
            z = Math.cos(b) * Math.cos(a);
          const tilt = 0.15;
          return {
            x: center + radius * x,
            y: center - radius * (y * Math.cos(tilt) - z * Math.sin(tilt)),
            z: y * Math.sin(tilt) + z * Math.cos(tilt),
          };
        };
        const line = (
          points: number[][],
          color: string,
          weight: number,
          hemisphere: 'front' | 'back',
        ) => {
          ctx.beginPath();
          let pen = false;
          for (const [lon, lat] of points) {
            const p = project(lon, lat);
            if (hemisphere === 'front' ? p.z <= 0.01 : p.z >= -0.01) {
              pen = false;
              continue;
            }
            if (pen) ctx.lineTo(p.x, p.y);
            else ctx.moveTo(p.x, p.y);
            pen = true;
          }
          ctx.strokeStyle = color;
          ctx.lineWidth = weight;
          ctx.lineCap = 'round';
          ctx.setLineDash([0.1, 4]);
          ctx.shadowColor = '#bdbdbd';
          ctx.shadowBlur = hemisphere === 'back' ? 4 : 3;
          ctx.stroke();
          ctx.shadowBlur = 0;
          ctx.setLineDash([]);
          ctx.lineCap = 'butt';
        };
        // Far-side continents show through the transparent globe as a faint depth layer.
        for (const outline of land) line(outline, '#a3a3a3aa', 2.1, 'back');
        for (const outline of land) line(outline, '#b8b8b8dd', 2.1, 'front');
        for (let i = 0; i < offices.length; i++) {
          const location = offices[i],
            p = project(location.lon, location.lat);
          if (p.z <= -0.01) {
            ctx.beginPath();
            ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
            ctx.shadowColor = '#60a5fa';
            ctx.shadowBlur = 12;
            ctx.fillStyle = '#60a5fa';
            ctx.fill();
            ctx.shadowBlur = 0;
            continue;
          }
          if (p.z <= 0.01) continue;
          const active = selected === i;
          const pulse = (time % 2200) / 2200;
          ctx.beginPath();
          ctx.arc(p.x, p.y, active ? 11 + pulse * 13 : 7, 0, Math.PI * 2);
          ctx.strokeStyle = active ? `rgba(96,165,250,${0.7 * (1 - pulse)})` : '#60a5fa50';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.shadowColor = '#60a5fa';
          ctx.shadowBlur = active ? 22 : 13;
          ctx.beginPath();
          ctx.arc(p.x, p.y, active ? 5.5 : 4, 0, Math.PI * 2);
          ctx.fillStyle = active ? '#fff' : '#60a5fa';
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
      frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      observer.disconnect();
    };
  }, [selected, paused, reduced, compact]);

  function select(index: number) {
    setSelected(index);
    focus.current = (-offices[index].lon * Math.PI) / 180;
  }

  return (
    <section
      className={`wissen-world${compact ? ' wissen-world-compact' : ''}`}
      aria-label="Wissen global office locations"
    >
      {!compact && (
        <div className="wissen-world-copy">
          <p className="landing-kicker">ONE WISSEN. WORLDWIDE.</p>
          <h2 id="world-title">
            Connected by talent.
            <br />
            <span>Across the globe.</span>
          </h2>
          <p>
            From our teams in India to offices around the world, explore the places Wissen calls
            home.
          </p>
          <div className="world-location">
            <MapPin size={21} />
            <div aria-live="polite">
              <strong>{office.city}</strong>
              <span>{office.country}</span>
            </div>
            <span className="world-location-count">
              {String(selected + 1).padStart(2, '0')} / {offices.length}
            </span>
          </div>
          <p className="world-office-address">{office.address}</p>
          <label className="world-select-label" htmlFor="wissen-office">
            Explore an office
          </label>
          <select
            id="wissen-office"
            value={selected}
            onChange={(event) => select(Number(event.target.value))}
          >
            {offices.map((item, i) => (
              <option key={item.city} value={i}>
                {item.city} · {item.country}
              </option>
            ))}
          </select>
          <a href="https://wissen.com/contact/location" target="_blank" rel="noreferrer">
            View official office locations ↗
          </a>
        </div>
      )}
      <div className="wissen-world-visual" ref={stage} data-paused={paused || reduced}>
        <div className="world-hologram">
          <canvas
            ref={canvas}
            role="img"
            aria-label={`Rotating 3D globe of Wissen office cities. Selected: ${office.city}, ${office.country}.${compact ? '' : ' Use the office selector to explore locations.'}`}
          />
        </div>
        {!compact && <span className="world-caption">WISSEN / GLOBAL PRESENCE</span>}
        {!compact && (
          <button
            className="world-pause"
            onClick={() => setPaused(!paused)}
            disabled={reduced}
            aria-label={paused ? 'Resume globe rotation' : 'Pause globe rotation'}
          >
            {paused || reduced ? <Play size={14} /> : <Pause size={14} />}
            {reduced ? 'Reduced motion' : paused ? 'Resume rotation' : 'Pause rotation'}
          </button>
        )}
      </div>
    </section>
  );
}
