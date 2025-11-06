import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import { format } from 'date-fns';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

interface House {
  id: string;
  name: string;
  description: string;
  image: string;
  ownerId: string;
  ownerName: string;
  sharedWith: string[];
  createdAt: string;
}

interface CalendarEvent {
  id: string;
  houseId: string;
  dates: string[];
  type: string;
  brokerId?: string;
  brokerName?: string;
  brokerEmail?: string;
  value?: number;
  status: string;
  createdAt: string;
}

export default function HouseDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const [house, setHouse] = useState<House | null>(null);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [proposals, setProposals] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [showProposeModal, setShowProposeModal] = useState(false);
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [proposeValue, setProposeValue] = useState('');
  const [markedDates, setMarkedDates] = useState<any>({});

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    updateMarkedDates();
  }, [events, selectedDates]);

  async function loadData() {
    try {
      const [houseRes, eventsRes, proposalsRes] = await Promise.all([
        api.get(`/houses/${id}`),
        api.get(`/calendar/${id}`),
        api.get(`/proposals/${id}`),
      ]);

      setHouse(houseRes.data);
      setEvents(eventsRes.data);
      setProposals(proposalsRes.data);
    } catch (error) {
      console.error('Error loading data:', error);
      Alert.alert('Erro', 'Erro ao carregar dados');
    } finally {
      setLoading(false);
    }
  }

  function updateMarkedDates() {
    const marked: any = {};

    events.forEach((event) => {
      if (event.type === 'blocked' || event.type === 'approved') {
        event.dates.forEach((date) => {
          marked[date] = {
            selected: true,
            selectedColor: '#F44336',
            marked: true,
            dotColor: '#F44336',
          };
        });
      } else if (event.type === 'pending') {
        event.dates.forEach((date) => {
          marked[date] = {
            selected: true,
            selectedColor: '#4CAF50',
            marked: true,
            dotColor: '#4CAF50',
          };
        });
      }
    });

    selectedDates.forEach((date) => {
      if (!marked[date]) {
        marked[date] = {
          selected: true,
          selectedColor: '#2196F3',
        };
      }
    });

    setMarkedDates(marked);
  }

  function handleDayPress(day: any) {
    const dateStr = day.dateString;

    const isBlocked = events.some(
      (event) =>
        (event.type === 'blocked' || event.type === 'approved') &&
        event.dates.includes(dateStr)
    );

    if (user?.role === 'corretor') {
      if (isBlocked) {
        Alert.alert('Data indisponível', 'Esta data já está bloqueada ou locada');
        return;
      }

      if (selectedDates.includes(dateStr)) {
        setSelectedDates(selectedDates.filter((d) => d !== dateStr));
      } else {
        setSelectedDates([...selectedDates, dateStr]);
      }
    } else {
      if (isBlocked) {
        Alert.alert('Atenção', 'Esta data já está bloqueada');
        return;
      }

      Alert.alert(
        'Bloquear Data',
        `Deseja bloquear a data ${format(new Date(dateStr), 'dd/MM/yyyy')}?`,
        [
          { text: 'Cancelar', style: 'cancel' },
          {
            text: 'Bloquear',
            onPress: () => blockDate(dateStr),
          },
        ]
      );
    }
  }

  async function blockDate(date: string) {
    try {
      await api.post(`/calendar/${id}/block`, { dates: [date] });
      Alert.alert('Sucesso', 'Data bloqueada com sucesso!');
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao bloquear data';
      Alert.alert('Erro', message);
    }
  }

  async function handleShare() {
    if (!shareEmail) {
      Alert.alert('Erro', 'Digite um email');
      return;
    }

    try {
      await api.post(`/houses/${id}/share`, { email: shareEmail });
      Alert.alert('Sucesso', 'Convite enviado com sucesso!');
      setShowShareModal(false);
      setShareEmail('');
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao compartilhar';
      Alert.alert('Erro', message);
    }
  }

  async function handlePropose() {
    if (selectedDates.length === 0) {
      Alert.alert('Erro', 'Selecione pelo menos uma data');
      return;
    }

    if (!proposeValue || parseFloat(proposeValue) <= 0) {
      Alert.alert('Erro', 'Digite um valor válido');
      return;
    }

    try {
      await api.post(`/calendar/${id}/propose`, {
        dates: selectedDates,
        value: parseFloat(proposeValue),
      });

      Alert.alert('Sucesso', 'Proposta enviada com sucesso!');
      setShowProposeModal(false);
      setSelectedDates([]);
      setProposeValue('');
      loadData();
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao enviar proposta';
      Alert.alert('Erro', message);
    }
  }

  async function handleProposalAction(proposalId: string, action: 'approve' | 'reject') {
    const actionText = action === 'approve' ? 'aprovar' : 'rejeitar';

    Alert.alert(
      'Confirmar',
      `Deseja ${actionText} esta proposta?`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Confirmar',
          onPress: async () => {
            try {
              await api.put(`/proposals/${proposalId}/action`, { action });
              Alert.alert('Sucesso', `Proposta ${action === 'approve' ? 'aprovada' : 'rejeitada'}!`);
              loadData();
            } catch (error: any) {
              const message = error.response?.data?.detail || `Erro ao ${actionText} proposta`;
              Alert.alert('Erro', message);
            }
          },
        },
      ]
    );
  }

  function navigateToHistory() {
    router.push({
      pathname: '/house/history/[id]',
      params: { id: id as string },
    });
  }

  if (loading || !house) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{house.name}</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView>
        <Image source={{ uri: house.image }} style={styles.houseImage} />

        <View style={styles.infoSection}>
          <Text style={styles.houseName}>{house.name}</Text>
          <Text style={styles.houseDescription}>{house.description}</Text>

          {user?.role === 'proprietario' && (
            <View style={styles.actionsRow}>
              <TouchableOpacity
                style={styles.actionButton}
                onPress={() => setShowShareModal(true)}
              >
                <Ionicons name="share-outline" size={20} color="#2196F3" />
                <Text style={styles.actionButtonText}>Compartilhar</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.actionButton}
                onPress={navigateToHistory}
              >
                <Ionicons name="time-outline" size={20} color="#2196F3" />
                <Text style={styles.actionButtonText}>Histórico</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.calendarSection}>
          <View style={styles.calendarHeader}>
            <Text style={styles.sectionTitle}>Calendário</Text>
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#F44336' }]} />
                <Text style={styles.legendText}>Bloqueado</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#4CAF50' }]} />
                <Text style={styles.legendText}>Pendente</Text>
              </View>
            </View>
          </View>

          <Calendar
            markedDates={markedDates}
            onDayPress={handleDayPress}
            theme={{
              todayTextColor: '#2196F3',
              selectedDayBackgroundColor: '#2196F3',
              arrowColor: '#2196F3',
            }}
            minDate={new Date().toISOString().split('T')[0]}
          />

          {user?.role === 'corretor' && selectedDates.length > 0 && (
            <TouchableOpacity
              style={styles.proposeButton}
              onPress={() => setShowProposeModal(true)}
            >
              <Text style={styles.proposeButtonText}>
                Fazer Proposta ({selectedDates.length} {selectedDates.length === 1 ? 'data' : 'datas'})
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {user?.role === 'proprietario' && proposals.length > 0 && (
          <View style={styles.proposalsSection}>
            <Text style={styles.sectionTitle}>Propostas Pendentes</Text>
            {proposals.map((proposal) => (
              <View key={proposal.id} style={styles.proposalCard}>
                <View style={styles.proposalHeader}>
                  <Text style={styles.proposalBroker}>{proposal.brokerName}</Text>
                  <Text style={styles.proposalValue}>R$ {proposal.value?.toFixed(2)}</Text>
                </View>
                <Text style={styles.proposalDates}>
                  Datas: {proposal.dates.map(d => format(new Date(d), 'dd/MM')).join(', ')}
                </Text>
                <View style={styles.proposalActions}>
                  <TouchableOpacity
                    style={[styles.proposalActionButton, styles.approveButton]}
                    onPress={() => handleProposalAction(proposal.id, 'approve')}
                  >
                    <Text style={styles.proposalActionText}>Aprovar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.proposalActionButton, styles.rejectButton]}
                    onPress={() => handleProposalAction(proposal.id, 'reject')}
                  >
                    <Text style={styles.proposalActionText}>Rejeitar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <Modal visible={showShareModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Compartilhar Casa</Text>
            <Text style={styles.modalSubtitle}>Digite o email do corretor</Text>

            <TextInput
              style={styles.modalInput}
              placeholder="corretor@email.com"
              value={shareEmail}
              onChangeText={setShareEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowShareModal(false);
                  setShareEmail('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleShare}
              >
                <Text style={styles.modalConfirmText}>Enviar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showProposeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Fazer Proposta</Text>
            <Text style={styles.modalSubtitle}>
              {selectedDates.length} {selectedDates.length === 1 ? 'data selecionada' : 'datas selecionadas'}
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="Valor da locação (R$)"
              value={proposeValue}
              onChangeText={setProposeValue}
              keyboardType="numeric"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowProposeModal(false);
                  setProposeValue('');
                }}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handlePropose}
              >
                <Text style={styles.modalConfirmText}>Enviar Proposta</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  centerContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  backButton: { padding: 8 },
  headerTitle: { fontSize: 18, fontWeight: '600', color: '#333' },
  houseImage: { width: '100%', height: 250, backgroundColor: '#f0f0f0' },
  infoSection: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' },
  houseName: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  houseDescription: { fontSize: 16, color: '#666', marginBottom: 16 },
  actionsRow: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: '#E3F2FD', padding: 12, borderRadius: 8 },
  actionButtonText: { color: '#2196F3', fontSize: 14, fontWeight: '600', marginLeft: 4 },
  calendarSection: { padding: 16 },
  calendarHeader: { marginBottom: 16 },
  sectionTitle: { fontSize: 20, fontWeight: '600', color: '#333', marginBottom: 12 },
  legend: { flexDirection: 'row', gap: 16 },
  legendItem: { flexDirection: 'row', alignItems: 'center' },
  legendDot: { width: 12, height: 12, borderRadius: 6, marginRight: 4 },
  legendText: { fontSize: 12, color: '#666' },
  proposeButton: { backgroundColor: '#2196F3', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 16 },
  proposeButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  proposalsSection: { padding: 16 },
  proposalCard: { backgroundColor: '#FFF9C4', borderRadius: 12, padding: 16, marginBottom: 12 },
  proposalHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  proposalBroker: { fontSize: 16, fontWeight: '600', color: '#333' },
  proposalValue: { fontSize: 18, fontWeight: 'bold', color: '#4CAF50' },
  proposalDates: { fontSize: 14, color: '#666', marginBottom: 12 },
  proposalActions: { flexDirection: 'row', gap: 12 },
  proposalActionButton: { flex: 1, padding: 12, borderRadius: 8, alignItems: 'center' },
  approveButton: { backgroundColor: '#4CAF50' },
  rejectButton: { backgroundColor: '#F44336' },
  proposalActionText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  modalInput: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center' },
  modalCancelButton: { backgroundColor: '#f5f5f5' },
  modalCancelText: { color: '#666', fontSize: 16, fontWeight: '600' },
  modalConfirmButton: { backgroundColor: '#2196F3' },
  modalConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
