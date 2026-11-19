"""Run the app with disposable credentials and database, then test in Chromium."""
from base64 import b64decode

import json
import struct
import os
import secrets
import shutil
import socket
import subprocess
import tempfile
import time
from urllib.request import urlopen
from playwright.sync_api import sync_playwright, expect


def glb_triangle():
    payload = struct.pack("<9f", 0, 0, 0, 1, 0, 0, 0, 1, 0)
    description = {
        "asset": {"version": "2.0"}, "scene": 0, "scenes": [{"nodes": [0]}],
        "nodes": [{"mesh": 0}], "meshes": [{"primitives": [{"attributes": {"POSITION": 0}}]}],
        "buffers": [{"byteLength": len(payload)}],
        "bufferViews": [{"buffer": 0, "byteLength": len(payload)}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": 3,
                       "type": "VEC3", "min": [0, 0, 0], "max": [1, 1, 0]}],
    }
    manifest = json.dumps(description).encode()
    manifest += b" " * (-len(manifest) % 4)
    return b"".join([struct.pack("<4sII", b"glTF", 2, 28 + len(manifest) + len(payload)),
                     struct.pack("<I4s", len(manifest), b"JSON"), manifest,
                     struct.pack("<I4s", len(payload), b"BIN\0"), payload])


def exercise(browser, base, admin, viewer):
    expect.set_options(timeout=15000)
    for width, height in [(1440, 920), (390, 844)]:
        page = browser.new_page(viewport={"width": width, "height": height})
        errors = []
        external = []
        page.on("request", lambda request: external.append(request.url)
                if request.url.startswith(("http:", "https:")) and not request.url.startswith(base + "/") else None)
        page.on("pageerror", lambda err: errors.append(str(err)))
        page.goto(base + "/admin")
        expect(page.get_by_role("heading", name="Entre no estúdio")).to_be_visible()
        page.get_by_label("Perfil").select_option("admin")
        page.get_by_label("Senha").fill("inválida")
        page.get_by_role("button", name="Entrar").click()
        expect(page.get_by_role("alert")).to_contain_text("incorretos")
        page.get_by_label("Senha").fill(admin)
        page.get_by_role("button", name="Entrar").click()
        expect(page.get_by_role("heading", name="Administração")).to_be_visible()
        page.get_by_role("link", name="Estúdio", exact=True).click()
        expect(page.locator("canvas")).to_be_visible()
        expect(page.get_by_text("Nenhum objeto na cena.")).to_be_visible()
        assert page.evaluate("document.documentElement.scrollWidth === innerWidth")
        page.get_by_role("button", name="Exportar OBJ").click()
        expect(page.get_by_role("status")).to_contain_text("antes de exportar")
        page.get_by_role("button", name="Adicionar forma").click()
        expect(page.get_by_role("button", name="Cubo")).to_be_visible()
        page.get_by_label("Posição X", exact=True).fill("2.5")
        page.get_by_role("button", name="Aplicar alterações").click()
        expect(page.get_by_role("status")).to_contain_text("atualizado")
        page.get_by_role("button", name="Aumentar zoom").click()
        expect(page.locator("#zoom")).to_have_text("120%")
        page.get_by_role("button", name="Enquadrar").click()
        expect(page.locator("#zoom")).to_have_text("100%")
        page.get_by_label("Descreva uma forma").fill("faça uma escultura")
        page.get_by_role("button", name="Enviar").click()
        expect(page.get_by_role("status")).to_contain_text("Descreva um cubo")
        page.get_by_label("Descreva uma forma").fill("crie uma esfera")
        page.get_by_role("button", name="Enviar").click()
        expect(page.get_by_text("Assistente: Forma adicionada: Esfera.")).to_be_visible()
        page.get_by_label("Descreva uma forma").fill("Crie um personagem verde")
        page.get_by_role("button", name="Enviar").click()
        expect(page.get_by_role("button", name="Pedestal")).to_be_visible()
        expect(page.get_by_role("button", name="Cabeça")).to_be_visible()
        image = b64decode("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAAAAABX3VL4AAAADklEQVR4nGNg+M/Q8Q4ABgACduMRc+YAAAAASUVORK5CYII=")
        page.get_by_label("Imagem de referência").set_input_files(
            {"name":"referencia.png","mimeType":"image/png","buffer":image})
        page.get_by_role("button", name="Gerar relevo 3D").click()
        expect(page.get_by_role("button", name="Relevo de referencia.png")).to_be_visible()
        upload = page.get_by_label("Importar modelo")
        upload.set_input_files({"name": "ruim.glb", "mimeType": "model/gltf-binary", "buffer": b"bad"})
        page.get_by_role("button", name="Importar arquivo").click()
        expect(page.get_by_role("status")).to_contain_text("Não foi possível ler a malha")
        upload.set_input_files({"name": "triangulo.obj", "mimeType": "text/plain",
                                "buffer": b"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"})
        page.get_by_role("button", name="Importar arquivo").click()
        expect(page.get_by_role("status")).to_contain_text("Modelo importado")
        upload.set_input_files({"name": "malha.glb", "mimeType": "model/gltf-binary", "buffer": glb_triangle()})
        page.get_by_role("button", name="Importar arquivo").click()
        expect(page.get_by_role("status")).to_contain_text("Modelo importado")
        expect(page.get_by_role("button", name="malha.glb")).to_be_visible()
        with page.expect_download() as download:
            page.get_by_role("button", name="Exportar OBJ").click()
        assert download.value.suggested_filename == "cena.obj"
        assert "f " in download.value.path().read_text()
        title = f"Cena de teste {width}"
        page.get_by_label("Nome do projeto").fill(title)
        page.get_by_role("button", name="Salvar projeto").click()
        expect(page.get_by_role("status")).to_contain_text("Projeto salvo")
        direct = page.url
        assert direct != base + "/studio"
        page.reload()
        expect(page.get_by_role("heading", name=title)).to_be_visible()
        expect(page.get_by_role("button", name="triangulo.obj")).to_be_visible()
        page.get_by_role("button", name="Cubo").click()
        expect(page.get_by_label("Posição X", exact=True)).to_have_value("2.5")
        page.get_by_role("button", name="Sair").click()
        expect(page.get_by_role("heading", name="Entre no estúdio")).to_be_visible()
        page.get_by_label("Senha").fill(viewer)
        page.get_by_role("button", name="Entrar").click()
        expect(page.get_by_role("link", name=title)).to_be_visible()
        page.goto(direct)
        expect(page.get_by_role("heading", name=title)).to_be_visible()
        expect(page.get_by_role("button", name="Salvar projeto")).to_be_hidden()
        assert page.request.post(base + "/api/projects", data={}).status == 403
        assert page.request.get(base + "/admin").status == 403
        assert page.request.get(base + "/api/admin").status == 403
        page.get_by_role("button", name="Sair").click()
        expect(page.get_by_role("heading", name="Entre no estúdio")).to_be_visible()
        assert page.request.get(base + "/api/projects").status == 401
        assert page.request.get(base + "/rota-inexistente").status == 404
        assert not errors, errors
        assert not external, external
        page.close()
        print(f"Chromium {width} × {height}: OK", flush=True)


with tempfile.TemporaryDirectory() as directory:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        port = sock.getsockname()[1]
    base = f"http://127.0.0.1:{port}"
    admin, viewer = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    env = dict(os.environ, PORT=str(port), HOST="127.0.0.1", ADMIN_PASSWORD=admin, VIEWER_PASSWORD=viewer,
               SECURE_COOKIE="0", STUDIO_DATA_DIR=directory)
    server = subprocess.Popen(["node", "server.js"], env=env)
    try:
        for _ in range(80):
            try:
                with urlopen(base + "/api/session", timeout=1):
                    break
            except OSError:
                if server.poll() is not None:
                    raise RuntimeError("O servidor encerrou durante a inicialização.")
                time.sleep(.1)
        else:
            raise RuntimeError("O servidor não iniciou no tempo esperado.")
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(executable_path=shutil.which("chromium"),
                                                 args=["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"])
            try:
                exercise(browser, base, admin, viewer)
            finally:
                browser.close()
    finally:
        server.terminate()
        server.wait(timeout=5)
