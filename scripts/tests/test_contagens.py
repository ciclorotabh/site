"""Testes do gerador de contagens. Rodar: python3 -m unittest discover -s scripts/tests"""
import datetime as dt
import os
import sys
import unittest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import atualizar_contagens as ac  # noqa: E402

CAB = ["Ano", "Data", "Horário", "Período", "Latitude", "Longitude", "Ciclistas", "Fonte", "Local", "Tipo"]
LAT, LON = "19°55'15.9\"S", "43°57'08.6\"W"


def linha(data, horario, periodo, ciclistas, local="Ciclovia Augusto de Lima", tipo="Video"):
    return [None, data, horario, periodo, LAT, LON, ciclistas, "Cristiano Scarpelli; Marco Túlio", local, tipo]


def dia_inteiro(data, valores):
    return [linha(data, h, "1 hora", v) for h, v in enumerate(valores)]


HORAS_2409 = [6, 1, 2, 0, 1, 3, 7, 22, 32, 14, 17, 19, 10, 19, 22, 11, 18, 32, 49, 40, 20, 17, 10, 8]


class Coordenadas(unittest.TestCase):
    def test_dms_sul_oeste(self):
        self.assertAlmostEqual(ac.coord("19°55'21.0\"S", "latitude"), -19.9225, places=4)
        self.assertAlmostEqual(ac.coord("43°56'47.6\"W", "longitude"), -43.946556, places=4)

    def test_decimal(self):
        self.assertEqual(ac.coord("-19.92", "latitude"), -19.92)

    def test_fora_de_bh(self):
        with self.assertRaises(ac.ErroDeDado):
            ac.coord("23°33'00\"S", "latitude")


class Janelas(unittest.TestCase):
    def test_soma_das_horas_bate_com_agregados(self):
        d = dt.datetime(2026, 9, 24)
        linhas = dia_inteiro(d, HORAS_2409) + [
            linha(d, None, "1 hora", 49), linha(d, None, "2 horas", 81),
            linha(d, None, "12 horas", 265), linha(d, None, "24 horas", 380),
        ]
        out = ac.montar((CAB, linhas))
        self.assertEqual(out["avisos"], [])
        por = {c["periodo"]: c["ciclistas"] for c in out["contagens"]}
        self.assertEqual(por, {1: 49, 2: 81, 12: 265, 24: 380})
        # nenhuma contagem duplicada: 4 janelas, não 8
        self.assertEqual(len(out["contagens"]), 4)
        self.assertEqual(out["perfis"][0]["horas"], HORAS_2409)

    def test_divergencia_vira_aviso(self):
        d = dt.datetime(2026, 9, 24)
        linhas = dia_inteiro(d, HORAS_2409) + [linha(d, None, "24 horas", 999)]
        out = ac.montar((CAB, linhas))
        self.assertTrue(any("999" in a for a in out["avisos"]))
        self.assertEqual([c["ciclistas"] for c in out["contagens"] if c["periodo"] == 24], [380])

    def test_dia_incompleto_nao_gera_24h(self):
        d = dt.datetime(2026, 9, 24)
        linhas = [linha(d, h, "1 hora", v) for h, v in enumerate(HORAS_2409) if h != 3]
        out = ac.montar((CAB, linhas))
        self.assertNotIn(24, {c["periodo"] for c in out["contagens"]})
        self.assertTrue(any("24 h" in a for a in out["avisos"]))

    def test_hora_repetida_e_erro(self):
        d = dt.datetime(2026, 9, 24)
        with self.assertRaises(ac.ErroDeDado):
            ac.montar((CAB, dia_inteiro(d, HORAS_2409) + [linha(d, 5, "1 hora", 3)]))


class Normalizacao(unittest.TestCase):
    def test_tipo(self):
        self.assertEqual(ac.tipo("Presenciial"), "Presencial")
        self.assertEqual(ac.tipo("Video"), "Vídeo")

    def test_media_por_ano(self):
        linhas = [
            linha("27/04/2023", None, "1 hora", 10, "Av. X", "Presencial"),
            linha("28/04/2023", None, "1 hora", 20, "Av. X", "Presencial"),
            linha("02/05/2024", None, "1 hora", 33, "Av. X", "Presencial"),
        ]
        out = ac.montar((CAB, linhas))
        loc = out["locais"][0]
        self.assertEqual(loc["mediaHoraPorAno"], {"2023": 15.0, "2024": 33.0})
        self.assertEqual(loc["mediaHora"], 33.0)

    def test_ciclistas_negativo_e_erro(self):
        with self.assertRaises(ac.ErroDeDado):
            ac.montar((CAB, [linha("27/04/2023", None, "1 hora", -1)]))


if __name__ == "__main__":
    unittest.main()
