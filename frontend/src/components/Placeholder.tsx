import { Icon } from "./Icon";
import type { IconName } from "../data/mock";

interface PlaceholderProps {
  eyebrow: string;
  title: string;
  description: string;
  icon: IconName;
  planned: string[];
}

export function Placeholder({ eyebrow, title, description, icon, planned }: PlaceholderProps) {
  return (
    <>
      <section className="page-heading">
        <div>
          <p className="eyebrow">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="subtitle">{description}</p>
        </div>
      </section>
      <article className="panel placeholder-panel">
        <div className="placeholder-icon">
          <Icon name={icon} size={26} />
        </div>
        <h2>Coming in the next milestone</h2>
        <p>This is where the feature will live. Planned for this page:</p>
        <ul>
          {planned.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </article>
    </>
  );
}
