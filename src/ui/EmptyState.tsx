import type { ReactNode } from 'react';
import { Scene } from '../brand/Scene';
import type { SceneData } from '../brand/Scene';

// An empty or waiting state as one calm scene: a block picture of the
// situation, one heading, one line and at most one action.
export default function EmptyState({ scene, title, level = 2, children, action }: {
  scene: SceneData; title: string; level?: 1 | 2; children?: ReactNode; action?: ReactNode;
}) {
  const Heading = level === 1 ? 'h1' : 'h2';
  return (
    <section className="empty-state">
      <div className="empty-scene"><Scene scene={scene} /></div>
      <div className="empty-copy">
        <Heading>{title}</Heading>
        {children && <p>{children}</p>}
        {action}
      </div>
    </section>
  );
}
