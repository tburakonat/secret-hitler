import { cva, type VariantProps } from 'class-variance-authority';
import { clsx } from 'clsx';

const button = cva(
  'inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        primary:   'bg-red-700 text-white hover:bg-red-600',
        secondary: 'bg-gray-700 text-white hover:bg-gray-600',
        outline:   'border border-gray-600 text-gray-200 hover:bg-gray-800',
        ghost:     'text-gray-300 hover:bg-gray-800 hover:text-white',
      },
      size: {
        sm: 'h-8 px-3',
        md: 'h-10 px-4',
        lg: 'h-12 px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={clsx(button({ variant, size }), className)} {...props} />;
}
