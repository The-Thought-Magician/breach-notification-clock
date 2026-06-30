import type { HTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from 'react'

export function Table({ className = '', children, ...props }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="overflow-x-auto rounded-xl border border-zinc-800">
      <table className={`w-full border-collapse text-sm ${className}`} {...props}>
        {children}
      </table>
    </div>
  )
}

export function THead({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return (
    <thead className={`bg-zinc-900/80 ${className}`} {...props}>
      {children}
    </thead>
  )
}

export function TBody({ className = '', children, ...props }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...props}>{children}</tbody>
}

export function TR({ className = '', children, ...props }: HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={`border-t border-zinc-800 hover:bg-zinc-900/50 ${className}`} {...props}>
      {children}
    </tr>
  )
}

export function TH({ className = '', children, ...props }: ThHTMLAttributes<HTMLTableCellElement>) {
  return (
    <th className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-zinc-500 ${className}`} {...props}>
      {children}
    </th>
  )
}

export function TD({ className = '', children, ...props }: TdHTMLAttributes<HTMLTableCellElement>) {
  return (
    <td className={`px-4 py-3 text-zinc-200 align-middle ${className}`} {...props}>
      {children}
    </td>
  )
}

export default Table
