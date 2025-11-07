from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from datetime import datetime, timedelta
from passlib.context import CryptContext
from jose import JWTError, jwt
from bson import ObjectId
import os
import logging
from pathlib import Path
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Security
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# JWT Settings
SECRET_KEY = os.environ.get("SECRET_KEY", "your-secret-key-change-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Create the main app
app = FastAPI()
api_router = APIRouter(prefix="/api")

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)


# ==================== MODELS ====================

class UserRegister(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: str  # 'proprietario' or 'corretor'

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class UserResponse(BaseModel):
    id: str
    email: str
    name: str
    role: str

class UserProfileUpdate(BaseModel):
    name: Optional[str] = None
    phone: Optional[str] = None
    photo: Optional[str] = None  # base64

class BrokerRequest(BaseModel):
    email: EmailStr

class HouseCreate(BaseModel):
    name: str
    description: str
    image: str  # base64

class HouseUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    image: Optional[str] = None

class HouseResponse(BaseModel):
    id: str
    name: str
    description: str
    image: str
    ownerId: str
    ownerName: str
    sharedWith: List[str]
    createdAt: str

class ShareHouseRequest(BaseModel):
    email: EmailStr

class BlockDatesRequest(BaseModel):
    dates: List[str]  # ISO date strings

class ProposeLocacaoRequest(BaseModel):
    dates: List[str]  # ISO date strings
    value: float

class CalendarEventResponse(BaseModel):
    id: str
    houseId: str
    dates: List[str]
    type: str  # 'blocked', 'pending', 'approved'
    brokerId: Optional[str] = None
    brokerName: Optional[str] = None
    brokerEmail: Optional[str] = None
    value: Optional[float] = None
    status: str
    createdAt: str

class ProposalActionRequest(BaseModel):
    action: str  # 'approve' or 'reject'

class HistoryResponse(BaseModel):
    id: str
    houseId: str
    dates: List[str]
    brokerEmail: str
    brokerName: str
    value: float
    status: str
    actionAt: str


# ==================== UTILS ====================

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Token inválido")
    except JWTError:
        raise HTTPException(status_code=401, detail="Token inválido")
    
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    if user is None:
        raise HTTPException(status_code=401, detail="Usuário não encontrado")
    
    return user

async def send_email(to_email: str, subject: str, body: str):
    """Send email using Gmail SMTP - user needs to configure"""
    try:
        # For development, just log the email
        logger.info(f"EMAIL TO: {to_email}")
        logger.info(f"SUBJECT: {subject}")
        logger.info(f"BODY: {body}")
        
        # In production, configure with real SMTP credentials
        # smtp_server = "smtp.gmail.com"
        # smtp_port = 587
        # sender_email = os.environ.get("SMTP_EMAIL", "")
        # sender_password = os.environ.get("SMTP_PASSWORD", "")
        
        # if sender_email and sender_password:
        #     message = MIMEMultipart()
        #     message["From"] = sender_email
        #     message["To"] = to_email
        #     message["Subject"] = subject
        #     message.attach(MIMEText(body, "html"))
        #     
        #     await aiosmtplib.send(
        #         message,
        #         hostname=smtp_server,
        #         port=smtp_port,
        #         start_tls=True,
        #         username=sender_email,
        #         password=sender_password,
        #     )
        
        return True
    except Exception as e:
        logger.error(f"Error sending email: {str(e)}")
        return False


# ==================== AUTH ROUTES ====================

@api_router.post("/auth/register")
async def register(user_data: UserRegister):
    # Check if user exists
    existing_user = await db.users.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Validate role
    if user_data.role not in ['proprietario', 'corretor']:
        raise HTTPException(status_code=400, detail="Role inválido. Use 'proprietario' ou 'corretor'")
    
    # Create user
    user_dict = {
        "email": user_data.email,
        "password": get_password_hash(user_data.password),
        "name": user_data.name,
        "role": user_data.role,
        "createdAt": datetime.utcnow().isoformat()
    }
    
    result = await db.users.insert_one(user_dict)
    
    # Create token
    access_token = create_access_token(data={"sub": str(result.inserted_id)})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(result.inserted_id),
            "email": user_data.email,
            "name": user_data.name,
            "role": user_data.role
        }
    }

@api_router.post("/auth/login")
async def login(credentials: UserLogin):
    user = await db.users.find_one({"email": credentials.email})
    if not user or not verify_password(credentials.password, user["password"]):
        raise HTTPException(status_code=401, detail="Email ou senha incorretos")
    
    access_token = create_access_token(data={"sub": str(user["_id"])})
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user["_id"]),
            "email": user["email"],
            "name": user["name"],
            "role": user["role"]
        }
    }

@api_router.get("/auth/me")
async def get_me(current_user: dict = Depends(get_current_user)):
    return {
        "id": str(current_user["_id"]),
        "email": current_user["email"],
        "name": current_user["name"],
        "role": current_user["role"],
        "phone": current_user.get("phone", ""),
        "photo": current_user.get("photo", "")
    }

@api_router.put("/auth/profile")
async def update_profile(profile_data: UserProfileUpdate, current_user: dict = Depends(get_current_user)):
    """Update user profile"""
    update_dict = {}
    
    if profile_data.name is not None:
        update_dict["name"] = profile_data.name
    if profile_data.phone is not None:
        update_dict["phone"] = profile_data.phone
    if profile_data.photo is not None:
        update_dict["photo"] = profile_data.photo
    
    if update_dict:
        await db.users.update_one(
            {"_id": ObjectId(current_user["_id"])},
            {"$set": update_dict}
        )
    
    updated_user = await db.users.find_one({"_id": ObjectId(current_user["_id"])})
    
    return {
        "id": str(updated_user["_id"]),
        "email": updated_user["email"],
        "name": updated_user["name"],
        "role": updated_user["role"],
        "phone": updated_user.get("phone", ""),
        "photo": updated_user.get("photo", "")
    }


# ==================== HOUSE ROUTES ====================

@api_router.get("/houses")
async def get_houses(current_user: dict = Depends(get_current_user)):
    """Get houses based on user role"""
    if current_user["role"] == "proprietario":
        # Get houses owned by this user
        houses = await db.houses.find({"ownerId": str(current_user["_id"])}).to_list(1000)
    else:
        # Get houses shared with this corretor
        houses = await db.houses.find({"sharedWith": current_user["email"]}).to_list(1000)
    
    result = []
    for house in houses:
        result.append({
            "id": str(house["_id"]),
            "name": house["name"],
            "description": house["description"],
            "image": house["image"],
            "ownerId": house["ownerId"],
            "ownerName": house.get("ownerName", ""),
            "sharedWith": house.get("sharedWith", []),
            "createdAt": house["createdAt"]
        })
    
    return result

@api_router.post("/houses")
async def create_house(house_data: HouseCreate, current_user: dict = Depends(get_current_user)):
    """Create a new house (proprietario only)"""
    if current_user["role"] != "proprietario":
        raise HTTPException(status_code=403, detail="Apenas proprietários podem criar casas")
    
    house_dict = {
        "name": house_data.name,
        "description": house_data.description,
        "image": house_data.image,
        "ownerId": str(current_user["_id"]),
        "ownerName": current_user["name"],
        "sharedWith": [],
        "createdAt": datetime.utcnow().isoformat()
    }
    
    result = await db.houses.insert_one(house_dict)
    
    return {
        "id": str(result.inserted_id),
        "name": house_data.name,
        "description": house_data.description,
        "image": house_data.image,
        "ownerId": str(current_user["_id"]),
        "ownerName": current_user["name"],
        "sharedWith": [],
        "createdAt": house_dict["createdAt"]
    }

@api_router.get("/houses/{house_id}")
async def get_house(house_id: str, current_user: dict = Depends(get_current_user)):
    """Get house details"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    # Check permissions
    if current_user["role"] == "proprietario":
        if house["ownerId"] != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Sem permissão")
    else:
        if current_user["email"] not in house.get("sharedWith", []):
            raise HTTPException(status_code=403, detail="Sem permissão")
    
    return {
        "id": str(house["_id"]),
        "name": house["name"],
        "description": house["description"],
        "image": house["image"],
        "ownerId": house["ownerId"],
        "ownerName": house.get("ownerName", ""),
        "sharedWith": house.get("sharedWith", []),
        "createdAt": house["createdAt"]
    }

@api_router.put("/houses/{house_id}")
async def update_house(house_id: str, house_data: HouseUpdate, current_user: dict = Depends(get_current_user)):
    """Update house (proprietario only)"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    if house["ownerId"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Sem permissão")
    
    update_dict = {}
    if house_data.name is not None:
        update_dict["name"] = house_data.name
    if house_data.description is not None:
        update_dict["description"] = house_data.description
    if house_data.image is not None:
        update_dict["image"] = house_data.image
    
    if update_dict:
        await db.houses.update_one({"_id": ObjectId(house_id)}, {"$set": update_dict})
    
    updated_house = await db.houses.find_one({"_id": ObjectId(house_id)})
    
    return {
        "id": str(updated_house["_id"]),
        "name": updated_house["name"],
        "description": updated_house["description"],
        "image": updated_house["image"],
        "ownerId": updated_house["ownerId"],
        "ownerName": updated_house.get("ownerName", ""),
        "sharedWith": updated_house.get("sharedWith", []),
        "createdAt": updated_house["createdAt"]
    }

@api_router.post("/houses/{house_id}/share")
async def share_house(house_id: str, share_data: ShareHouseRequest, current_user: dict = Depends(get_current_user)):
    """Share house with a corretor (proprietario only)"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    if house["ownerId"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Sem permissão")
    
    # Check if corretor exists
    corretor = await db.users.find_one({"email": share_data.email, "role": "corretor"})
    if not corretor:
        raise HTTPException(status_code=404, detail="Corretor não encontrado com este email")
    
    # Add to sharedWith if not already there
    if share_data.email not in house.get("sharedWith", []):
        await db.houses.update_one(
            {"_id": ObjectId(house_id)},
            {"$push": {"sharedWith": share_data.email}}
        )
        
        # Send email notification
        email_body = f"""
        <h2>Convite para Gerenciar Casa</h2>
        <p>Olá {corretor['name']},</p>
        <p>Você foi convidado por {current_user['name']} para gerenciar a casa: <strong>{house['name']}</strong></p>
        <p>Acesse o app Agenda TTI para visualizar o calendário e fazer propostas de locação.</p>
        <p>Descrição: {house['description']}</p>
        """
        await send_email(share_data.email, "Convite - Agenda TTI", email_body)
    
    return {"message": "Casa compartilhada com sucesso", "email": share_data.email}


# ==================== CALENDAR ROUTES ====================

@api_router.get("/calendar/{house_id}")
async def get_calendar(house_id: str, current_user: dict = Depends(get_current_user)):
    """Get calendar events for a house"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    # Check permissions
    if current_user["role"] == "proprietario":
        if house["ownerId"] != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Sem permissão")
    else:
        if current_user["email"] not in house.get("sharedWith", []):
            raise HTTPException(status_code=403, detail="Sem permissão")
    
    # Get all events
    events = await db.calendar_events.find({"houseId": house_id}).to_list(1000)
    
    result = []
    for event in events:
        broker_info = {}
        if event.get("brokerId"):
            broker = await db.users.find_one({"_id": ObjectId(event["brokerId"])})
            if broker:
                broker_info = {
                    "brokerName": broker["name"],
                    "brokerEmail": broker["email"]
                }
        
        result.append({
            "id": str(event["_id"]),
            "houseId": event["houseId"],
            "dates": event["dates"],
            "type": event["type"],
            "brokerId": event.get("brokerId"),
            "brokerName": broker_info.get("brokerName"),
            "brokerEmail": broker_info.get("brokerEmail"),
            "value": event.get("value"),
            "status": event["status"],
            "createdAt": event["createdAt"]
        })
    
    return result

@api_router.post("/calendar/{house_id}/block")
async def block_dates(house_id: str, block_data: BlockDatesRequest, current_user: dict = Depends(get_current_user)):
    """Block dates (proprietario only)"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    if house["ownerId"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Apenas o proprietário pode bloquear datas")
    
    # Check for overlaps
    for date_str in block_data.dates:
        existing = await db.calendar_events.find_one({
            "houseId": house_id,
            "dates": date_str,
            "type": {"$in": ["blocked", "approved"]}
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Data {date_str} já está bloqueada ou locada")
    
    # Create event
    event_dict = {
        "houseId": house_id,
        "dates": block_data.dates,
        "type": "blocked",
        "status": "blocked",
        "createdAt": datetime.utcnow().isoformat()
    }
    
    result = await db.calendar_events.insert_one(event_dict)
    
    return {
        "id": str(result.inserted_id),
        "message": "Datas bloqueadas com sucesso",
        "dates": block_data.dates
    }

@api_router.post("/calendar/{house_id}/propose")
async def propose_locacao(house_id: str, propose_data: ProposeLocacaoRequest, current_user: dict = Depends(get_current_user)):
    """Propose locacao (corretor only)"""
    if current_user["role"] != "corretor":
        raise HTTPException(status_code=403, detail="Apenas corretores podem fazer propostas")
    
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    if current_user["email"] not in house.get("sharedWith", []):
        raise HTTPException(status_code=403, detail="Sem permissão para esta casa")
    
    # Check for overlaps
    for date_str in propose_data.dates:
        existing = await db.calendar_events.find_one({
            "houseId": house_id,
            "dates": date_str,
            "type": {"$in": ["blocked", "approved"]}
        })
        if existing:
            raise HTTPException(status_code=400, detail=f"Data {date_str} já está indisponível")
    
    # Create proposal
    event_dict = {
        "houseId": house_id,
        "dates": propose_data.dates,
        "type": "pending",
        "brokerId": str(current_user["_id"]),
        "value": propose_data.value,
        "status": "pending",
        "createdAt": datetime.utcnow().isoformat()
    }
    
    result = await db.calendar_events.insert_one(event_dict)
    
    # Send email to owner
    owner = await db.users.find_one({"_id": ObjectId(house["ownerId"])})
    if owner:
        dates_formatted = ", ".join(propose_data.dates)
        email_body = f"""
        <h2>Nova Proposta de Locação</h2>
        <p>Olá {owner['name']},</p>
        <p>Você recebeu uma nova proposta de locação para a casa: <strong>{house['name']}</strong></p>
        <p><strong>Corretor:</strong> {current_user['name']} ({current_user['email']})</p>
        <p><strong>Datas:</strong> {dates_formatted}</p>
        <p><strong>Valor:</strong> R$ {propose_data.value:.2f}</p>
        <p>Acesse o app para aprovar ou rejeitar esta proposta.</p>
        """
        await send_email(owner["email"], "Nova Proposta - Agenda TTI", email_body)
    
    return {
        "id": str(result.inserted_id),
        "message": "Proposta enviada com sucesso! Aguarde aprovação do proprietário.",
        "dates": propose_data.dates,
        "value": propose_data.value
    }


# ==================== PROPOSAL ROUTES ====================

@api_router.get("/proposals/{house_id}")
async def get_proposals(house_id: str, current_user: dict = Depends(get_current_user)):
    """Get pending proposals for a house"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    # Check permissions
    if current_user["role"] == "proprietario":
        if house["ownerId"] != str(current_user["_id"]):
            raise HTTPException(status_code=403, detail="Sem permissão")
    else:
        if current_user["email"] not in house.get("sharedWith", []):
            raise HTTPException(status_code=403, detail="Sem permissão")
    
    # Get pending proposals
    proposals = await db.calendar_events.find({
        "houseId": house_id,
        "status": "pending"
    }).to_list(1000)
    
    result = []
    for proposal in proposals:
        broker = await db.users.find_one({"_id": ObjectId(proposal["brokerId"])})
        result.append({
            "id": str(proposal["_id"]),
            "houseId": proposal["houseId"],
            "dates": proposal["dates"],
            "brokerId": proposal["brokerId"],
            "brokerName": broker["name"] if broker else "",
            "brokerEmail": broker["email"] if broker else "",
            "value": proposal["value"],
            "status": proposal["status"],
            "createdAt": proposal["createdAt"]
        })
    
    return result

@api_router.put("/proposals/{proposal_id}/action")
async def proposal_action(proposal_id: str, action_data: ProposalActionRequest, current_user: dict = Depends(get_current_user)):
    """Approve or reject a proposal (proprietario only)"""
    if current_user["role"] != "proprietario":
        raise HTTPException(status_code=403, detail="Apenas proprietários podem aprovar/rejeitar propostas")
    
    proposal = await db.calendar_events.find_one({"_id": ObjectId(proposal_id)})
    if not proposal:
        raise HTTPException(status_code=404, detail="Proposta não encontrada")
    
    house = await db.houses.find_one({"_id": ObjectId(proposal["houseId"])})
    if house["ownerId"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Sem permissão")
    
    if action_data.action == "approve":
        # Update proposal to approved
        await db.calendar_events.update_one(
            {"_id": ObjectId(proposal_id)},
            {"$set": {"status": "approved", "type": "approved"}}
        )
        
        # Add to history
        broker = await db.users.find_one({"_id": ObjectId(proposal["brokerId"])})
        history_dict = {
            "houseId": proposal["houseId"],
            "dates": proposal["dates"],
            "brokerEmail": broker["email"],
            "brokerName": broker["name"],
            "value": proposal["value"],
            "status": "approved",
            "actionAt": datetime.utcnow().isoformat()
        }
        await db.history.insert_one(history_dict)
        
        # Send email to broker
        dates_formatted = ", ".join(proposal["dates"])
        email_body = f"""
        <h2>Proposta Aprovada!</h2>
        <p>Olá {broker['name']},</p>
        <p>Sua proposta foi <strong>APROVADA</strong>!</p>
        <p><strong>Casa:</strong> {house['name']}</p>
        <p><strong>Datas:</strong> {dates_formatted}</p>
        <p><strong>Valor:</strong> R$ {proposal['value']:.2f}</p>
        <p>Locação confirmada!</p>
        """
        await send_email(broker["email"], "Proposta Aprovada - Agenda TTI", email_body)
        
        return {"message": "Proposta aprovada com sucesso!", "status": "approved"}
    
    elif action_data.action == "reject":
        # Delete the proposal
        await db.calendar_events.delete_one({"_id": ObjectId(proposal_id)})
        
        # Add to history
        broker = await db.users.find_one({"_id": ObjectId(proposal["brokerId"])})
        history_dict = {
            "houseId": proposal["houseId"],
            "dates": proposal["dates"],
            "brokerEmail": broker["email"],
            "brokerName": broker["name"],
            "value": proposal["value"],
            "status": "rejected",
            "actionAt": datetime.utcnow().isoformat()
        }
        await db.history.insert_one(history_dict)
        
        # Send email to broker
        dates_formatted = ", ".join(proposal["dates"])
        email_body = f"""
        <h2>Proposta Rejeitada</h2>
        <p>Olá {broker['name']},</p>
        <p>Sua proposta foi rejeitada.</p>
        <p><strong>Casa:</strong> {house['name']}</p>
        <p><strong>Datas:</strong> {dates_formatted}</p>
        <p>Você pode fazer uma nova proposta.</p>
        """
        await send_email(broker["email"], "Proposta Rejeitada - Agenda TTI", email_body)
        
        return {"message": "Proposta rejeitada", "status": "rejected"}
    
    else:
        raise HTTPException(status_code=400, detail="Ação inválida. Use 'approve' ou 'reject'")


# ==================== HISTORY ROUTES ====================

@api_router.get("/history/{house_id}")
async def get_history(house_id: str, current_user: dict = Depends(get_current_user)):
    """Get history for a house (proprietario only)"""
    house = await db.houses.find_one({"_id": ObjectId(house_id)})
    if not house:
        raise HTTPException(status_code=404, detail="Casa não encontrada")
    
    if house["ownerId"] != str(current_user["_id"]):
        raise HTTPException(status_code=403, detail="Apenas o proprietário pode ver o histórico")
    
    history = await db.history.find({"houseId": house_id}).sort("actionAt", -1).to_list(1000)
    
    result = []
    for item in history:
        result.append({
            "id": str(item["_id"]),
            "houseId": item["houseId"],
            "dates": item["dates"],
            "brokerEmail": item["brokerEmail"],
            "brokerName": item["brokerName"],
            "value": item["value"],
            "status": item["status"],
            "actionAt": item["actionAt"]
        })
    
    return result


# ==================== HEALTH CHECK ====================

@api_router.get("/")
async def root():
    return {"message": "Agenda TTI API - OK"}


# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
