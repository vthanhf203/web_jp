"use client";

type ConfirmSubmitButtonProps = {
  label: string;
  confirmMessage: string;
  className?: string;
  disabled?: boolean;
};

export function ConfirmSubmitButton({
  label,
  confirmMessage,
  className,
  disabled,
}: ConfirmSubmitButtonProps) {
  return (
    <button
      type="submit"
      className={className}
      disabled={disabled}
      onClick={(event) => {
        if (disabled) {
          return;
        }
        if (!window.confirm(confirmMessage)) {
          event.preventDefault();
        }
      }}
    >
      {label}
    </button>
  );
}
