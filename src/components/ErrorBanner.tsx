"use client";

import { memo } from "react";

interface Props {
  errors: string[];
}

export default memo(function ErrorBanner({ errors }: Props) {
  if (errors.length === 0) return null;

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
      <div className="flex items-start gap-3">
        <svg
          className="w-5 h-5 text-yellow-500 mt-0.5 flex-shrink-0"
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path
            fillRule="evenodd"
            d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z"
            clipRule="evenodd"
          />
        </svg>
        <div>
          <h4 className="text-yellow-800 font-medium text-sm">
            Algunas sucursales no responden
          </h4>
          <ul className="mt-1 space-y-1">
            {errors.map((err, i) => (
              <li key={i} className="text-yellow-700 text-sm">
                {err}
              </li>
            ))}
          </ul>
          <p className="text-yellow-600 text-xs mt-2">
            Los datos de las sucursales disponibles se muestran normalmente.
          </p>
        </div>
      </div>
    </div>
  );
})
