import { createContext, useContext } from 'react';
import type { FormMeta } from './form.types';

const FormMetaContext = createContext<FormMeta>({ readOnly: false, autoSave: false });

export const FormMetaProvider = FormMetaContext.Provider;

/** Read readOnly / autoSave state injected by `<Form>`. */
export const useFormMeta = () => useContext(FormMetaContext);
