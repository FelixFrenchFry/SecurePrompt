import type { SelectHTMLAttributes } from 'react';

// a dropdown with Primer's look, its chevron drawn by the wrapper
export const Select = ({ small = false, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { small?: boolean }) =>
{
    return (
        <span className={small ? 'select select-small' : 'select'}>
            <select {...rest} />
        </span>
    );
};
