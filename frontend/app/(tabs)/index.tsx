import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
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

export default function HomeScreen() {
  const { user } = useAuth();
  const router = useRouter();
  const [houses, setHouses] = useState<House[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    loadHouses();
  }, []);

  async function loadHouses() {
    try {
      const response = await api.get('/houses');
      setHouses(response.data);
    } catch (error) {
      console.error('Error loading houses:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadHouses();
  }, []);

  function handleHousePress(house: House) {
    router.push({
      pathname: '/house/[id]',
      params: { id: house.id },
    });
  }

  function handleAddHouse() {
    router.push('/house/create');
  }

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#2196F3" />
      </View>
    );
  }

  const title = user?.role === 'proprietario' ? 'Minhas Casas' : 'Casas Disponíveis';

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
        {user?.role === 'proprietario' && (
          <TouchableOpacity onPress={handleAddHouse} style={styles.addButton}>
            <Ionicons name="add" size={28} color="#2196F3" />
          </TouchableOpacity>
        )}
      </View>

      {houses.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="home-outline" size={64} color="#ccc" />
          <Text style={styles.emptyText}>
            {user?.role === 'proprietario'
              ? 'Nenhuma casa cadastrada'
              : 'Nenhuma casa compartilhada com você'}
          </Text>
          {user?.role === 'proprietario' && (
            <TouchableOpacity style={styles.emptyButton} onPress={handleAddHouse}>
              <Text style={styles.emptyButtonText}>Cadastrar Casa</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : (
        <FlatList
          data={houses}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.houseCard}
              onPress={() => handleHousePress(item)}
            >
              <Image
                source={{ uri: item.image }}
                style={styles.houseImage}
                resizeMode="cover"
              />
              <View style={styles.houseInfo}>
                <Text style={styles.houseName}>{item.name}</Text>
                <Text style={styles.houseDescription} numberOfLines={2}>
                  {item.description}
                </Text>
                {user?.role === 'corretor' && (
                  <Text style={styles.ownerText}>Proprietário: {item.ownerName}</Text>
                )}
              </View>
              <Ionicons name="chevron-forward" size={24} color="#999" />
            </TouchableOpacity>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  addButton: {
    padding: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyText: {
    fontSize: 18,
    color: '#999',
    textAlign: 'center',
    marginTop: 16,
  },
  emptyButton: {
    backgroundColor: '#2196F3',
    paddingHorizontal: 32,
    paddingVertical: 16,
    borderRadius: 12,
    marginTop: 24,
  },
  emptyButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    padding: 16,
  },
  houseCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 12,
    marginBottom: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  houseImage: {
    width: 80,
    height: 80,
    borderRadius: 8,
    backgroundColor: '#f0f0f0',
  },
  houseInfo: {
    flex: 1,
    marginLeft: 12,
  },
  houseName: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  houseDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  ownerText: {
    fontSize: 12,
    color: '#999',
  },
});
