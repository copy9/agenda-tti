"""
Script para popular o banco de dados com dados de teste
Cria:
- 1 Proprietário: dono@test.com / senha123
- 1 Corretor: corretor@test.com / senha123  
- 2 Casas cadastradas
- Casa compartilhada com o corretor
- 1 Proposta pendente do corretor
- Algumas datas bloqueadas
"""

import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from datetime import datetime, timedelta
import os
from dotenv import load_dotenv

load_dotenv()

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# Imagem base64 de exemplo (casa pequena)
SAMPLE_IMAGE = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCABkAGQDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlbaWmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD3+iiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooAKKKKACiiigAooooA/9k="

async def seed_database():
    print("Limpando banco de dados...")
    await db.users.delete_many({})
    await db.houses.delete_many({})
    await db.calendar_events.delete_many({})
    await db.history.delete_many({})
    
    print("Criando usuários...")
    
    # Criar proprietário
    proprietario = {
        "email": "dono@test.com",
        "password": pwd_context.hash("senha123"),
        "name": "João Silva",
        "role": "proprietario",
        "createdAt": datetime.utcnow().isoformat()
    }
    proprietario_result = await db.users.insert_one(proprietario)
    proprietario_id = str(proprietario_result.inserted_id)
    print(f"✓ Proprietário criado: {proprietario['email']}")
    
    # Criar corretores
    corretor1 = {
        "email": "corretor@test.com",
        "password": pwd_context.hash("senha123"),
        "name": "Maria Santos",
        "role": "corretor",
        "phone": "(11) 98765-4321",
        "createdAt": datetime.utcnow().isoformat()
    }
    corretor1_result = await db.users.insert_one(corretor1)
    corretor1_id = str(corretor1_result.inserted_id)
    print(f"✓ Corretor 1 criado: {corretor1['email']}")
    
    corretor2 = {
        "email": "paulo.corretor@test.com",
        "password": pwd_context.hash("senha123"),
        "name": "Paulo Oliveira",
        "role": "corretor",
        "phone": "(11) 91234-5678",
        "createdAt": datetime.utcnow().isoformat()
    }
    corretor2_result = await db.users.insert_one(corretor2)
    corretor2_id = str(corretor2_result.inserted_id)
    print(f"✓ Corretor 2 criado: {corretor2['email']}")
    
    corretor3 = {
        "email": "ana.corretor@test.com",
        "password": pwd_context.hash("senha123"),
        "name": "Ana Rodrigues",
        "role": "corretor",
        "phone": "(11) 99999-8888",
        "createdAt": datetime.utcnow().isoformat()
    }
    corretor3_result = await db.users.insert_one(corretor3)
    corretor3_id = str(corretor3_result.inserted_id)
    print(f"✓ Corretor 3 criado: {corretor3['email']}")
    
    # Atualizar proprietário com corretores vinculados
    await db.users.update_one(
        {"_id": proprietario_result.inserted_id},
        {"$set": {"linkedBrokers": [corretor1["email"], corretor2["email"]]}}
    )
    print(f"✓ Corretores vinculados ao proprietário")
    
    print("\nCriando casas...")
    
    # Casa 1 - Compartilhada com corretor
    casa1 = {
        "name": "Casa de Praia Guarujá",
        "description": "Linda casa na praia com 3 quartos, piscina e churrasqueira. Vista para o mar.",
        "image": SAMPLE_IMAGE,
        "ownerId": proprietario_id,
        "ownerName": proprietario["name"],
        "sharedWith": [corretor1["email"], corretor2["email"]],
        "createdAt": datetime.utcnow().isoformat()
    }
    casa1_result = await db.houses.insert_one(casa1)
    casa1_id = str(casa1_result.inserted_id)
    print(f"✓ Casa 1 criada: {casa1['name']} (compartilhada com corretor)")
    
    # Casa 2 - Não compartilhada ainda
    casa2 = {
        "name": "Sítio em Holambra",
        "description": "Sítio completo com área de lazer, lago para pesca e trilhas. Perfeito para fins de semana.",
        "image": SAMPLE_IMAGE,
        "ownerId": proprietario_id,
        "ownerName": proprietario["name"],
        "sharedWith": [],
        "createdAt": datetime.utcnow().isoformat()
    }
    casa2_result = await db.houses.insert_one(casa2)
    casa2_id = str(casa2_result.inserted_id)
    print(f"✓ Casa 2 criada: {casa2['name']}")
    
    print("\nCriando eventos do calendário...")
    
    # Bloquear algumas datas na Casa 1 (proprietário bloqueou)
    today = datetime.now()
    blocked_dates = []
    for i in range(3):
        date = (today + timedelta(days=i+1)).strftime('%Y-%m-%d')
        blocked_dates.append(date)
    
    block_event = {
        "houseId": casa1_id,
        "dates": blocked_dates,
        "type": "blocked",
        "status": "blocked",
        "createdAt": datetime.utcnow().isoformat()
    }
    await db.calendar_events.insert_one(block_event)
    print(f"✓ Datas bloqueadas na Casa 1: {', '.join(blocked_dates)}")
    
    # Criar proposta PENDENTE do corretor1 para Casa 1
    proposal_dates = []
    for i in range(5, 8):  # Dias 5, 6, 7
        date = (today + timedelta(days=i)).strftime('%Y-%m-%d')
        proposal_dates.append(date)
    
    proposal = {
        "houseId": casa1_id,
        "dates": proposal_dates,
        "type": "pending",
        "brokerId": corretor1_id,
        "value": 1500.00,
        "status": "pending",
        "createdAt": datetime.utcnow().isoformat()
    }
    await db.calendar_events.insert_one(proposal)
    print(f"✓ Proposta pendente criada: {', '.join(proposal_dates)} - R$ 1500.00")
    
    # Criar uma data aprovada (histórico) na Casa 1
    approved_dates = []
    for i in range(10, 12):
        date = (today + timedelta(days=i)).strftime('%Y-%m-%d')
        approved_dates.append(date)
    
    approved_event = {
        "houseId": casa1_id,
        "dates": approved_dates,
        "type": "approved",
        "brokerId": corretor_id,
        "value": 2000.00,
        "status": "approved",
        "createdAt": (datetime.utcnow() - timedelta(days=2)).isoformat()
    }
    await db.calendar_events.insert_one(approved_event)
    
    # Adicionar ao histórico
    history_approved = {
        "houseId": casa1_id,
        "dates": approved_dates,
        "brokerEmail": corretor["email"],
        "brokerName": corretor["name"],
        "value": 2000.00,
        "status": "approved",
        "actionAt": (datetime.utcnow() - timedelta(days=2)).isoformat()
    }
    await db.history.insert_one(history_approved)
    print(f"✓ Histórico criado: Locação aprovada - R$ 2000.00")
    
    # Criar uma proposta rejeitada no histórico
    rejected_dates = []
    for i in range(15, 17):
        date = (today + timedelta(days=i)).strftime('%Y-%m-%d')
        rejected_dates.append(date)
    
    history_rejected = {
        "houseId": casa1_id,
        "dates": rejected_dates,
        "brokerEmail": corretor["email"],
        "brokerName": corretor["name"],
        "value": 1200.00,
        "status": "rejected",
        "actionAt": (datetime.utcnow() - timedelta(days=5)).isoformat()
    }
    await db.history.insert_one(history_rejected)
    print(f"✓ Histórico criado: Proposta rejeitada - R$ 1200.00")
    
    print("\n" + "="*60)
    print("✅ DADOS DE TESTE CRIADOS COM SUCESSO!")
    print("="*60)
    print("\n📋 CREDENCIAIS DE ACESSO:")
    print("\n🏠 PROPRIETÁRIO:")
    print(f"   Email: {proprietario['email']}")
    print(f"   Senha: senha123")
    print(f"   - 2 casas cadastradas")
    print(f"   - Casa 1 compartilhada com corretor")
    print(f"   - 1 proposta PENDENTE para aprovar/rejeitar")
    print(f"   - Histórico com 2 itens")
    
    print("\n👨‍💼 CORRETOR:")
    print(f"   Email: {corretor['email']}")
    print(f"   Senha: senha123")
    print(f"   - Acesso à Casa de Praia")
    print(f"   - 1 proposta PENDENTE aguardando resposta")
    print(f"   - Pode fazer novas propostas")
    
    print("\n🎯 FLUXO COMPLETO FUNCIONAL:")
    print("   ✓ Login como proprietário ou corretor")
    print("   ✓ Proprietário: Ver casas, compartilhar, bloquear datas")
    print("   ✓ Proprietário: Aprovar/Rejeitar propostas pendentes")
    print("   ✓ Proprietário: Ver histórico completo")
    print("   ✓ Corretor: Ver casas compartilhadas")
    print("   ✓ Corretor: Selecionar datas e fazer propostas")
    print("   ✓ Calendário com cores: Vermelho (bloqueado), Verde (pendente)")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(seed_database())
