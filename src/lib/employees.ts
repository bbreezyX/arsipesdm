import { z } from "zod";
import { participantSchema, type Participant } from "./model";

export const employeeSchema = participantSchema.omit({ id: true }).extend({
  rank: z.string().trim().max(1000, "Golongan maksimal 1.000 karakter.").default(""),
});
// Suggested PNS golongan/ruang; other personnel formats remain free-form.
// Reference: https://apps-denpasar.bkn.go.id/kms/ensiklopedia:pangkat_pns
export const employeeRankOptions = ["I", "II", "III", "IV"].flatMap(group =>
  (group === "IV" ? ["a", "b", "c", "d", "e"] : ["a", "b", "c", "d"])
    .map(room => ({value: `${group}/${room}`})),
);
export type EmployeeInput = ReturnType<typeof employeeSchema.parse>;
export type Employee = EmployeeInput & {
  id: string;
  version: number;
  identities: string[];
  deletedAt: string | null;
};
export function employeeIdentity(p: Pick<Participant, "name" | "nip">) {
  return p.nip.trim() ? `nip:${p.nip.trim()}` : `name:${p.name.trim().toLocaleLowerCase("id-ID")}`;
}
export function employeeMatches(p: Employee, participant: Participant) {
  return p.identities.includes(employeeIdentity(participant));
}
