# High detail gateway

This is the service the phone talks to. It checks the app key, stores the photos and their ARCore poses, and asks NodeODM (GPU) to build a textured mesh. NodeODM is not published on the network. Only port **8787** is.

The PC in this setup is Windows 11 at `192.168.1.147`, with Docker Desktop, a Quadro P2000, and the existing photos/models under `D:\nodeodm-data`. The phone reaches that address on the home LAN, or through UniFi Teleport when it is away.

## One-time setup

1. Install Docker Desktop with the WSL2 engine, and the NVIDIA driver for the Quadro P2000. In Docker Desktop, turn on GPU support (Settings, Resources, WSL integration, and confirm `docker run --gpus all nvidia/cuda:12.0.0-base-ubuntu22.04 nvidia-smi` can see the P2000).
2. Open PowerShell in this folder (`server\gateway`).
3. Create the env file and set a long random key. The phone must use the same key.

```powershell
cd C:\path\to\mountain-chicken-android\server\gateway
copy .env.example .env
notepad .env
```

Set `APP_KEY` to that secret. Leave `NODEODM_DATA=D:/nodeodm-data` if that folder is where you want NodeODM to keep its work. Leave `NODEODM_URL` as `http://nodeodm:3000` so the gateway uses the container started by Compose, not a port on the host.

4. Stop the NodeODM container you already run on `127.0.0.1:3000`. The P2000 can only feed one GPU container, and Compose starts its own. Publishing 3000 is no longer needed.

```powershell
docker ps
docker stop <the-nodeodm-container-name>
```

5. Build and start both containers. Only 8787 is published.

```powershell
docker compose up -d --build
docker compose ps
curl http://127.0.0.1:8787/health
```

`/health` does not need the key. A healthy reply looks like `{"ok":true,"service":"mountain-chicken-gateway","nodeodm":"up"}`. The first `nodeodm: "down"` just means the GPU container is still starting. Check again in a minute. Logs:

```powershell
docker compose logs -f gateway
docker compose logs -f nodeodm
```

6. Allow the phone onto port 8787, and only on the private network profile. Do not use the Public profile.

```powershell
New-NetFirewallRule -DisplayName "Mountain Chicken gateway" -Direction Inbound -Protocol TCP -LocalPort 8787 -Action Allow -Profile Private
Get-NetConnectionProfile
```

The LAN adapter and the Teleport adapter should say `Private`. If Teleport is `Public`, set that adapter to Private in Windows (Settings, Network, the Teleport adapter, network profile Private) and run the firewall command again. Do not add a Public rule.

## Phone

In the app, open Settings. Server URL `http://192.168.1.147:8787`. App key is the same `APP_KEY`. Leave "Wait for Wi-Fi or VPN" on. At home the phone is on Wi-Fi. Away from home, connect UniFi Teleport first. The upload starts when the gateway's health check answers, which is how a VPN over cellular is allowed through.

## What the gateway does

- `Authorization: Bearer <APP_KEY>` on every route except `/health`.
- Photos upload in chunks (`Content-Range: bytes start-end/total`). A dropped upload continues from the last byte.
- Each photo can include an ARCore pose and intrinsics. Those are stored as `poses.json`. A `geo.txt` in a local meter frame is also sent to NodeODM as a camera prior. The phone still computes the final scale, rotation, and translation from NodeODM's camera positions, so holds stay on the rough scan.
- The NodeODM task uses feature-quality high, pc-quality high, mesh-size 300000, skip-orthophoto, and skip-report.
- The textured OBJ is packed into one GLB and split so each piece has at most 65000 vertices and 16-bit indices.

## Stop and update

```powershell
docker compose down
docker compose up -d --build
```

`docker compose down` does not delete `D:\nodeodm-data`.
