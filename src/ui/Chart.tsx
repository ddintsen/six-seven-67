import { useId } from 'react';
import type { PricePoint } from '../view';
import { formatPrice } from './format';

const dayFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullFormat = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'UTC' });

interface Props {
  question: string;
  points: PricePoint[];
  unit: string;
  // End of the time axis for dated quotes (usually the latest block time).
  until?: number;
  compact?: boolean;
  outcome?: string; // the outcome whose price is drawn, Yes unless the market names its outcomes
  // Polymarket's own price for the same outcome, drawn quietly behind the quotes.
  reference?: PricePoint[] | null;
  // Quotes hold until the next one, so they are drawn as steps; sampled market
  // prices (Polymarket's history) are joined by straight lines.
  sampled?: boolean;
}

// Dated points are published fixed quotes: each holds until the next one, so
// the line is drawn as steps on a time axis. Undated practice samples are
// drawn in observation order and the axis says so.
export function PriceChart({ question, points, unit, until, compact = false, outcome = 'Yes', reference = null, sampled = false }: Props) {
  const id = useId();
  if (points.length === 0) {
    return <figure className="chart chart-empty"><figcaption>No price history is available.</figcaption></figure>;
  }
  const dated = points.every(point => point.at !== null);
  const width = 640;
  const height = compact ? 120 : 240;
  const top = 10;
  const bottom = 10;
  const ref = dated && reference && reference.length > 1 ? reference.filter(point => point.at !== null) : [];
  const values = [...points, ...ref].map(point => point.yes);
  const low = Math.max(0, Math.floor((Math.min(...values) - 0.03) / 0.05) * 0.05);
  const high = Math.min(1, Math.ceil((Math.max(...values) + 0.03) / 0.05) * 0.05);
  const range = Math.max(high - low, 0.05);
  const y = (value: number) => top + (high - value) / range * (height - top - bottom);

  let path: string;
  let x: (at: number) => number = () => 0;
  let end: { x: number; y: number };
  let startLabel: string;
  let endLabel: string;
  if (dated) {
    const first = Math.min(points[0].at as number, ...(ref.length ? [ref[0].at as number] : []));
    const last = Math.max(until ?? 0, points[points.length - 1].at as number, ...(ref.length ? [ref[ref.length - 1].at as number] : []), first + 1);
    x = (at: number) => (at - first) / (last - first) * width;
    let d = `M${x(points[0].at as number)} ${y(points[0].yes)}`;
    for (let i = 1; i < points.length; i++) d += sampled ? ` L${x(points[i].at as number)} ${y(points[i].yes)}` : ` H${x(points[i].at as number)} V${y(points[i].yes)}`;
    d += sampled ? ` L${width} ${y(points[points.length - 1].yes)}` : ` H${width}`;
    path = d;
    end = { x: width, y: y(points[points.length - 1].yes) };
    startLabel = dayFormat.format(new Date(first * 1000));
    endLabel = until ? 'Now' : dayFormat.format(new Date(last * 1000));
  } else {
    const xi = (index: number) => points.length === 1 ? width / 2 : index / (points.length - 1) * width;
    path = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${xi(index)} ${y(point.yes)}`).join(' ');
    end = { x: xi(points.length - 1), y: y(points[points.length - 1].yes) };
    startLabel = 'Earliest sample';
    endLabel = 'Latest';
  }
  const percent = (value: number) => `${Math.round(value * 100)}%`;
  // Gridlines sit on round percentages inside the displayed range.
  const step = range > 0.4 ? 0.2 : range > 0.2 ? 0.1 : 0.05;
  const ticks: number[] = [];
  for (let tick = Math.ceil(low / step - 1e-9) * step; tick <= high + 1e-9; tick += step) ticks.unshift(Math.round(tick * 100) / 100);

  return (
    <figure className={`chart${compact ? ' chart-compact' : ''}`}>
      <div className="chart-plot" style={{ height: compact ? 120 : undefined }}>
        <div className="chart-area">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
            {ticks.map(tick => <line key={tick} className="chart-grid" x1="0" x2={width} y1={y(tick)} y2={y(tick)} vectorEffect="non-scaling-stroke" />)}
            {ref.length > 1 && <path className="chart-line-reference" d={ref.map((point, i) => `${i === 0 ? 'M' : 'L'}${x(point.at as number)} ${y(point.yes)}`).join(' ')} vectorEffect="non-scaling-stroke" />}
            {(points.length > 1 || dated) && <path className="chart-line" d={path} vectorEffect="non-scaling-stroke" />}
          </svg>
          <span className="chart-end" style={{ top: `${end.y / height * 100}%`, left: `${end.x / width * 100}%` }} aria-hidden="true" />
        </div>
        <div className="chart-y" aria-hidden="true">{ticks.map(tick => <span key={tick} style={{ top: `${y(tick) / height * 100}%` }}>{percent(tick)}</span>)}</div>
      </div>
      <div className="chart-x" aria-hidden="true"><span>{startLabel}</span><span>{endLabel}</span></div>
      {ref.length > 1 && <p className="chart-legend"><span className="legend-quote">67 quote</span><span className="legend-reference">Polymarket</span></p>}
      <figcaption id={id} className="sr-only">
        {outcome} price history for {question}. {points.length} {sampled ? 'samples' : dated ? 'published quotes' : 'samples without dates'}, shown as a percentage of the one {unit} payout.
      </figcaption>
      <div className="sr-only"><table aria-describedby={id}>
        <caption>{outcome} price history</caption>
        <thead><tr><th scope="col">{sampled ? 'Time (UTC)' : dated ? 'Published (UTC)' : 'Sample'}</th><th scope="col">{outcome} price ({unit} per share)</th></tr></thead>
        <tbody>{points.map((point, index) => <tr key={index}><th scope="row">{point.at !== null ? fullFormat.format(new Date(point.at * 1000)) : index + 1}</th><td>{formatPrice(point.yes)}</td></tr>)}</tbody>
      </table>
      {ref.length > 1 && <table>
        <caption>{outcome} price on Polymarket</caption>
        <thead><tr><th scope="col">Time (UTC)</th><th scope="col">Price (USDC per share)</th></tr></thead>
        <tbody>{ref.map((point, index) => <tr key={index}><th scope="row">{fullFormat.format(new Date((point.at as number) * 1000))}</th><td>{formatPrice(point.yes)}</td></tr>)}</tbody>
      </table>}</div>
    </figure>
  );
}
