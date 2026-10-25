/** Dropdown option */
export interface Option<T = string> {
  value: T;
  label: string;
  disabled?: boolean;
}

/** Action result */
export interface ActionResult<T = void> {
  success: boolean;
  data?: T;
  message?: string;
}
