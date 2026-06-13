// Point d'entrée de la couche domaine (pure, sans dépendance Expo).
export * from './types';
export * from './constantes';
export * from './dates';
export * from './baseline';
export * from './scoreForme';
// moteurAdaptation ré-exporte déjà chargeSeance/chargeHebdomadaire : on n'exporte
// donc de chargeEntrainement que les indicateurs dérivés (évite la collision).
export { acwr, monotonie, contrainte, zoneACWR } from './chargeEntrainement';
export type { ZoneACWR } from './chargeEntrainement';
export * from './moteurAdaptation';
export * from './modelesSeances';
export * from './generateurSemaines';
export * from './planning';
export * from './sauvegarde';
export * from './rapport';
export * from './progressionExercice';
export * from './allures';
export * from './importSanteConnect';
export * from './journalExpress';
export * from './correlations';
export * from './alimentation';
export * from './records';
export * from './tendances';
export * from './replanification';
export * from './bilanHebdo';
