'use client';

import { cn } from '@/lib/utils';

/**
 * FormField 通用表單欄位元件
 *
 * 設計決策：
 * - 統一封裝 label、input、error message 的佈局
 * - 支援 input、textarea、select 三種模式
 * - 錯誤狀態時自動標紅邊框與顯示錯誤訊息
 */

interface FormFieldBaseProps {
  label: string;
  name: string;
  error?: string;
  required?: boolean;
  description?: string;
}

interface InputFieldProps extends FormFieldBaseProps {
  type: 'text' | 'number' | 'email' | 'url' | 'password';
  value: string | number;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

interface TextareaFieldProps extends FormFieldBaseProps {
  type: 'textarea';
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  disabled?: boolean;
}

interface SelectFieldProps extends FormFieldBaseProps {
  type: 'select';
  value: string;
  onChange: (value: string) => void;
  options: { label: string; value: string }[];
  disabled?: boolean;
}

type FormFieldProps = InputFieldProps | TextareaFieldProps | SelectFieldProps;

export function FormField(props: FormFieldProps) {
  const { label, name, error, required, description } = props;

  return (
    <div className="space-y-1.5">
      {/* Label */}
      <label htmlFor={name} className="label-text">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </label>

      {/* Description */}
      {description && (
        <p className="text-xs text-gray-500">{description}</p>
      )}

      {/* Input 渲染 */}
      {props.type === 'textarea' ? (
        <textarea
          id={name}
          name={name}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          rows={props.rows || 4}
          disabled={props.disabled}
          className={cn(
            'input-field resize-y',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
          )}
        />
      ) : props.type === 'select' ? (
        <select
          id={name}
          name={name}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          disabled={props.disabled}
          className={cn(
            'input-field',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
          )}
        >
          <option value="">請選擇...</option>
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      ) : (
        <input
          id={name}
          name={name}
          type={props.type}
          value={props.value}
          onChange={(e) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
          className={cn(
            'input-field',
            error && 'border-red-500 focus:border-red-500 focus:ring-red-500'
          )}
        />
      )}

      {/* Error Message */}
      {error && (
        <p className="flex items-center gap-1 text-sm text-red-600">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
          </svg>
          {error}
        </p>
      )}
    </div>
  );
}
