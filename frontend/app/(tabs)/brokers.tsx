import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';

interface Broker {
  id: string;
  email: string;
  name: string;
  phone: string;
  photo: string;
}

export default function BrokersScreen() {
  const { user } = useAuth();
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [inviteToken, setInviteToken] = useState('');
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    loadBrokers();
  }, []);

  async function loadBrokers() {
    try {
      const response = await api.get('/brokers');
      setBrokers(response.data);
    } catch (error) {
      console.error('Error loading brokers:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadBrokers();
  }, []);

  async function handleInvite() {
    if (!inviteEmail) {
      Alert.alert('Erro', 'Digite um email');
      return;
    }

    setSending(true);
    try {
      const response = await api.post('/brokers/invite', { email: inviteEmail });
      Alert.alert(
        'Sucesso!',
        `Convite enviado para ${inviteEmail}. O corretor receberá um email com instruções para aceitar.`,
        [{ text: 'OK', onPress: () => {
          setShowInviteModal(false);
          setInviteEmail('');
        }}]
      );
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao enviar convite';
      Alert.alert('Erro', message);
    } finally {
      setSending(false);
    }
  }

  async function handleAcceptInvite() {
    if (!inviteToken) {
      Alert.alert('Erro', 'Cole o código do convite');
      return;
    }

    setAccepting(true);
    try {
      const response = await api.post('/brokers/accept-invite', { token: inviteToken });
      Alert.alert(
        'Convite Aceito!',
        `Você agora tem acesso a todas as casas de ${response.data.proprietario.name}`,
        [{ text: 'OK', onPress: () => {
          setShowAcceptModal(false);
          setInviteToken('');
        }}]
      );
    } catch (error: any) {
      const message = error.response?.data?.detail || 'Erro ao aceitar convite';
      Alert.alert('Erro', message);
    } finally {
      setAccepting(false);
    }
  }

  async function handleRemoveBroker(broker: Broker) {
    Alert.alert(
      'Remover Corretor',
      `Tem certeza que deseja remover ${broker.name}? Ele perderá acesso a todas as suas casas.`,
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Remover',
          style: 'destructive',
          onPress: async () => {
            try {
              await api.delete(`/brokers/${encodeURIComponent(broker.email)}`);
              Alert.alert('Sucesso', 'Corretor removido');
              loadBrokers();
            } catch (error: any) {
              const message = error.response?.data?.detail || 'Erro ao remover corretor';
              Alert.alert('Erro', message);
            }
          },
        },
      ]
    );
  }

  if (user?.role === 'corretor') {
    // Tela para corretores aceitarem convites
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Convites</Text>
        </View>

        <View style={styles.emptyContainer}>
          <Ionicons name="mail-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Aceite convites de proprietários</Text>
          <TouchableOpacity
            style={styles.acceptButton}
            onPress={() => setShowAcceptModal(true)}
          >
            <Ionicons name="checkmark-circle" size={24} color="#fff" />
            <Text style={styles.acceptButtonText}>Aceitar Convite</Text>
          </TouchableOpacity>
        </View>

        <Modal visible={showAcceptModal} transparent animationType="slide">
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Aceitar Convite</Text>
              <Text style={styles.modalSubtitle}>
                Cole o código do convite que você recebeu por email
              </Text>

              <TextInput
                style={[styles.modalInput, styles.codeInput]}
                placeholder="Código do convite"
                value={inviteToken}
                onChangeText={setInviteToken}
                multiline
                numberOfLines={3}
                autoCapitalize="none"
              />

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalCancelButton]}
                  onPress={() => {
                    setShowAcceptModal(false);
                    setInviteToken('');
                  }}
                  disabled={accepting}
                >
                  <Text style={styles.modalCancelText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalConfirmButton]}
                  onPress={handleAcceptInvite}
                  disabled={accepting}
                >
                  {accepting ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.modalConfirmText}>Aceitar</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </SafeAreaView>
    );
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Corretores Vinculados</Text>
        <TouchableOpacity
          onPress={() => setShowInviteModal(true)}
          style={styles.addButton}
        >
          <Ionicons name="add" size={28} color="#2196F3" />
        </TouchableOpacity>
      </View>

      {brokers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="people-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>Nenhum corretor vinculado</Text>
          <Text style={styles.emptySubtext}>
            Convide corretores para terem acesso a todas as suas casas
          </Text>
          <TouchableOpacity
            style={styles.emptyButton}
            onPress={() => setShowInviteModal(true)}
          >
            <Text style={styles.emptyButtonText}>Convidar Corretor</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={brokers}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <View style={styles.brokerCard}>
              <View style={styles.brokerAvatar}>
                <Ionicons name="person" size={32} color="#2196F3" />
              </View>
              <View style={styles.brokerInfo}>
                <Text style={styles.brokerName}>{item.name}</Text>
                <Text style={styles.brokerEmail}>{item.email}</Text>
                {item.phone && (
                  <Text style={styles.brokerPhone}>{item.phone}</Text>
                )}
              </View>
              <TouchableOpacity
                onPress={() => handleRemoveBroker(item)}
                style={styles.removeButton}
              >
                <Ionicons name="trash-outline" size={24} color="#F44336" />
              </TouchableOpacity>
            </View>
          )}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#2196F3']}
            />
          }
        />
      )}

      <Modal visible={showInviteModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Convidar Corretor</Text>
            <Text style={styles.modalSubtitle}>
              Digite o email do corretor. Ele receberá um convite por email.
            </Text>

            <TextInput
              style={styles.modalInput}
              placeholder="corretor@email.com"
              value={inviteEmail}
              onChangeText={setInviteEmail}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalCancelButton]}
                onPress={() => {
                  setShowInviteModal(false);
                  setInviteEmail('');
                }}
                disabled={sending}
              >
                <Text style={styles.modalCancelText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalButton, styles.modalConfirmButton]}
                onPress={handleInvite}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.modalConfirmText}>Enviar Convite</Text>
                )}
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
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333' },
  addButton: { padding: 8 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { fontSize: 18, color: '#999', textAlign: 'center', marginTop: 16 },
  emptySubtext: { fontSize: 14, color: '#bbb', textAlign: 'center', marginTop: 8 },
  emptyButton: { backgroundColor: '#2196F3', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, marginTop: 24 },
  emptyButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  acceptButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#4CAF50', paddingHorizontal: 32, paddingVertical: 16, borderRadius: 12, marginTop: 24 },
  acceptButtonText: { color: '#fff', fontSize: 16, fontWeight: '600', marginLeft: 8 },
  listContent: { padding: 16 },
  brokerCard: { flexDirection: 'row', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 },
  brokerAvatar: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#E3F2FD', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  brokerInfo: { flex: 1 },
  brokerName: { fontSize: 18, fontWeight: '600', color: '#333', marginBottom: 4 },
  brokerEmail: { fontSize: 14, color: '#666', marginBottom: 2 },
  brokerPhone: { fontSize: 12, color: '#999' },
  removeButton: { padding: 8 },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  modalContent: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%', maxWidth: 400 },
  modalTitle: { fontSize: 20, fontWeight: 'bold', color: '#333', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#666', marginBottom: 16 },
  modalInput: { backgroundColor: '#f5f5f5', borderRadius: 12, padding: 16, fontSize: 16, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 16 },
  codeInput: { height: 100, textAlignVertical: 'top' },
  modalButtons: { flexDirection: 'row', gap: 12 },
  modalButton: { flex: 1, padding: 16, borderRadius: 12, alignItems: 'center', minHeight: 50, justifyContent: 'center' },
  modalCancelButton: { backgroundColor: '#f5f5f5' },
  modalCancelText: { color: '#666', fontSize: 16, fontWeight: '600' },
  modalConfirmButton: { backgroundColor: '#2196F3' },
  modalConfirmText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
