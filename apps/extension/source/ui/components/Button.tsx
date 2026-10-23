import type { Icon } from '@primer/octicons-react';
import type { ButtonHTMLAttributes } from 'react';

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
    variant?: 'default' | 'primary' | 'invisible';
    small?: boolean;
    icon?: Icon;
};

export const Button = ({ variant = 'default', small = false, icon: LeadingIcon, className, children, ...rest }: ButtonProps) =>
{
    const classes = ['button', `button-${variant}`, small ? 'button-small' : '', className ?? ''].filter(Boolean).join(' ');

    return (
        <button type="button" className={classes} {...rest}>
            {LeadingIcon == null ? null : <LeadingIcon size={16} className="button-icon" />}
            {children}
        </button>
    );
};

type IconButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> & {
    icon: Icon;
    label: string;
};

export const IconButton = ({ icon: ButtonIcon, label, className, ...rest }: IconButtonProps) =>
{
    return (
        <button type="button" className={`icon-button ${className ?? ''}`} aria-label={label} title={label} {...rest}>
            <ButtonIcon size={16} />
        </button>
    );
};
