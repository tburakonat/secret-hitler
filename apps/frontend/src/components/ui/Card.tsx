import { clsx } from 'clsx';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  title?: string;
}

export function Card({ title, children, className, ...props }: CardProps) {
  return (
    <div
      className={clsx('rounded-lg border border-gray-700/80 bg-gray-900 shadow-sm', className)}
      {...props}
    >
      {title && (
        <div className="border-b border-gray-700/60 px-5 py-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">{title}</h2>
        </div>
      )}
      <div className={clsx(title ? 'p-5' : 'p-6')}>
        {children}
      </div>
    </div>
  );
}
