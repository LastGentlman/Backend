// Regímenes fiscales oficiales del SAT (México)
export interface TaxRegime {
  code: string;
  name: string;
  type: "fisica" | "moral" | "especial";
  description?: string;
}

export const TAX_REGIMES: TaxRegime[] = [
  // Personas Físicas
  {
    code: "605",
    name: "Sueldos y Salarios e Ingresos Asimilados a Salarios",
    type: "fisica",
    description: "Aplica a trabajadores dependientes; el empleador retiene ISR. Es el régimen más común entre empleados formales."
  },
  {
    code: "606",
    name: "Arrendamiento",
    type: "fisica",
    description: "Para ingresos provenientes de la renta de inmuebles urbanos o rústicos."
  },
  {
    code: "612",
    name: "Actividades Empresariales y Profesionales",
    type: "fisica",
    description: "Para personas que prestan servicios profesionales (requiere título profesional) o realizan actividades comerciales independientes."
  },
  {
    code: "621",
    name: "Incorporación Fiscal (RIF)",
    type: "fisica",
    description: "⚠️ EN DESAPARICIÓN - Dirigido a pequeños contribuyentes; ya no es posible inscribirse. Fue reemplazado por RESICO."
  },
  {
    code: "626",
    name: "Simplificado de Confianza (RESICO) - Personas Físicas",
    type: "fisica",
    description: "Para personas físicas con ingresos anuales menores a 3.5 millones de pesos. Ofrece tasas reducidas y procesos simplificados."
  },
  
  // Personas Morales
  {
    code: "601",
    name: "General de Ley Personas Morales",
    type: "moral",
    description: "Aplica a la mayoría de las empresas constituidas legalmente, dedicadas a actividades comerciales, industriales o servicios con fines de lucro."
  },
  {
    code: "614",
    name: "Personas Morales con Fines no Lucrativos",
    type: "moral",
    description: "Para asociaciones civiles, sindicatos, partidos políticos, ONGs, instituciones de beneficencia, etc."
  },
  {
    code: "623",
    name: "Simplificado de Confianza (RESICO) - Personas Morales",
    type: "moral",
    description: "Para empresas con ingresos anuales menores a 35 millones de pesos. Busca simplificar las obligaciones fiscales de las PYMES."
  },
  
  // Regímenes Especiales
  {
    code: "999",
    name: "Otro / Especial",
    type: "especial",
    description: "Para casos especiales no cubiertos por los regímenes anteriores."
  }
];

// Función helper para validar un código de régimen fiscal
export function isValidTaxRegime(code: string): boolean {
  return TAX_REGIMES.some(regime => regime.code === code);
}

// Función helper para obtener un régimen por código
export function getTaxRegimeByCode(code: string): TaxRegime | undefined {
  return TAX_REGIMES.find(regime => regime.code === code);
}

// Función helper para obtener regímenes por tipo
export function getTaxRegimesByType(type: "fisica" | "moral" | "especial"): TaxRegime[] {
  return TAX_REGIMES.filter(regime => regime.type === type);
} 