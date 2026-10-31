import { Icon, type IconName } from "./Icon";

export interface Stat {
  label: string;
  value: string;
  note: string;
  icon: IconName;
}

export function StatCard({ stat }: { stat: Stat }) {
  return (
    <article className="stat-card">
      <div className="stat-top">
        <span className="stat-label">{stat.label}</span>
        <span className="stat-icon">
          <Icon name={stat.icon} />
        </span>
      </div>
      <h2>{stat.value}</h2>
      <p>{stat.note}</p>
    </article>
  );
}
